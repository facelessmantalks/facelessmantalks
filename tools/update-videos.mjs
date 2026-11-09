#!/usr/bin/env node
/**
 * Refresh the "Now showing / top performers" section from the YouTube channel.
 *
 *   node tools/update-videos.mjs            rewrite index.html + sitemap.xml
 *   node tools/update-videos.mjs --dry      print what it found, change nothing
 *   node tools/update-videos.mjs --max 6    how many episodes to show (default 6)
 *
 * It reads the channel's public pages (no API key), ranks the videos by views,
 * puts the most watched one in the big player (with its chapters), the rest in a
 * swipeable row, links the newest one from the top of the page, and updates the
 * matching structured data for Google.
 * Only the parts between the VIDEOS markers are replaced.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CHANNEL = 'https://www.youtube.com/@FacelessManTalks';
const SUBSCRIBE = 'https://www.youtube.com/channel/UC9gM08bPptqc3I0oizeXnEw?sub_confirmation=1';
const SITE = 'https://www.facelessmantalks.com';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const MAX = Math.max(1, parseInt(args[args.indexOf('--max') + 1], 10) || 6);
// view counts are only printed on the page once a video has at least this many
const SHOW_VIEWS_FROM = 1000;

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'CONSENT=YES+1; SOCS=CAI'
};

async function get(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return r.text();
}
async function exists(url) {
  try { const r = await fetch(url, { method: 'HEAD', headers: HEADERS }); return r.ok; } catch { return false; }
}
function pageJson(html, name) {
  const m = html.match(new RegExp(`var ${name} = (\\{.*?\\});(?:var |<\\/script>)`, 's'));
  return m ? JSON.parse(m[1]) : null;
}
function collect(o, key, out = []) {
  if (Array.isArray(o)) o.forEach((v) => collect(v, key, out));
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) { if (k === key) out.push(v); collect(v, key, out); }
  }
  return out;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonStr = (s) => JSON.stringify(String(s));
const clock = (sec) => { const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; };
const human = (sec) => { const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`; };
const views = (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function chaptersFrom(desc, length) {
  const list = [];
  for (const line of desc.split('\n')) {
    const m = line.trim().match(/^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+[-–—]?\s*(.+)$/);
    if (!m) continue;
    const t = m[1].split(':').map(Number).reduce((a, v) => a * 60 + v, 0);
    list.push({ t, name: m[2].trim() });
  }
  if (list.length < 2 || list[0].t !== 0) return [];
  return list.map((c, i) => ({ ...c, end: i + 1 < list.length ? list[i + 1].t : length }));
}
function summary(desc) {
  const first = desc.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  return first.length > 320 ? first.slice(0, first.lastIndexOf(' ', 317)) + '…' : first;
}

async function main() {
  console.log(`Reading ${CHANNEL}/videos …`);
  const list = pageJson(await get(`${CHANNEL}/videos`), 'ytInitialData');
  if (!list) throw new Error('Could not read the channel page (YouTube may have changed its layout).');
  const ids = new Set();
  collect(list, 'videoRenderer').forEach((v) => v.videoId && ids.add(v.videoId));
  collect(list, 'lockupViewModel').forEach((v) => v.contentId && ids.add(v.contentId));
  if (!ids.size) throw new Error('No public videos found on the channel.');

  const videos = [];
  for (const id of ids) {
    const p = pageJson(await get(`https://www.youtube.com/watch?v=${id}`), 'ytInitialPlayerResponse');
    const d = p && p.videoDetails;
    if (!d || d.isLiveContent) continue;
    const mf = (p.microformat && p.microformat.playerMicroformatRenderer) || {};
    const length = parseInt(d.lengthSeconds, 10) || 0;
    if (length <= 60) continue; // skip Shorts
    const desc = d.shortDescription || '';
    const maxres = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    const hasMax = await exists(maxres);
    videos.push({
      id, title: d.title, length, views: parseInt(d.viewCount, 10) || 0,
      date: mf.publishDate || mf.uploadDate || new Date().toISOString(),
      desc, summary: summary(desc), chapters: chaptersFrom(desc, length),
      thumb: hasMax ? `https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp` : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      thumbJpg: hasMax ? maxres : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    });
    console.log(`  ${views(videos.at(-1).views).padStart(6)} views  ${d.title}`);
  }
  if (!videos.length) throw new Error('No long-form videos found.');
  videos.sort((a, b) => b.views - a.views || new Date(b.date) - new Date(a.date));
  const top = videos.slice(0, MAX);
  const [best, ...rest] = top;
  const isNew = (v) => Date.now() - new Date(v.date).getTime() < 14 * 864e5;

  /* ---- HTML ---- */
  const latest = [...videos].sort((x, y) => new Date(y.date) - new Date(x.date))[0];
  const label = videos.length > 1 ? 'Most watched so far' : 'Latest episode';
  const chapters = best.chapters.length ? `
            <details class="chapters">
              <summary>Chapters <span>${best.chapters.length}</span><svg class="ico" aria-hidden="true"><use href="#i-chev"/></svg></summary>
              <ol class="chapters__list">
${best.chapters.map((c) => `                <li><button type="button" data-seek="${c.t}"><time>${clock(c.t)}</time>${esc(c.name)}</button></li>`).join('\n')}
              </ol>
            </details>` : '';
  const feature = `
        <article class="feature" data-reveal aria-labelledby="v-${best.id}">
          <div class="player" data-player data-yt="${best.id}" data-title="${esc(best.title)}">
            <button class="player__btn" type="button" aria-label="Play video: ${esc(best.title)}">
              <img class="player__thumb" src="${best.thumb}" sizes="(min-width: 1024px) 640px, 92vw" srcset="https://i.ytimg.com/vi_webp/${best.id}/mqdefault.webp 320w, ${best.thumb} 1280w" width="1280" height="720" alt="Thumbnail: ${esc(best.title)}" loading="lazy" decoding="async">
              <span class="player__play" aria-hidden="true"><svg class="ico"><use href="#i-play"/></svg></span>
              <span class="player__dur">${clock(best.length)}</span>
            </button>
          </div>
          <div class="feature__body">
            <p class="feature__label"><span>${label}</span>${isNew(best) ? '<span class="badge-new">New</span>' : ''}</p>
            <h3 class="feature__title" id="v-${best.id}">${esc(best.title)}</h3>
            <p class="feature__meta"><time datetime="${best.date.slice(0, 10)}">${day(best.date)}</time><span aria-hidden="true">·</span>${human(best.length)}${best.views >= SHOW_VIEWS_FROM ? `<span aria-hidden="true">·</span>${views(best.views)} views` : ''}</p>
            <p class="feature__desc">${esc(best.summary)}</p>${chapters}
            <a class="link-arrow" href="https://www.youtube.com/watch?v=${best.id}" target="_blank" rel="noopener">Watch on YouTube <svg class="ico" aria-hidden="true"><use href="#i-out"/></svg></a>
          </div>
        </article>`;
  const cards = rest.map((v) => `
          <a class="ep" href="https://www.youtube.com/watch?v=${v.id}" data-reveal data-ep="${v.id}" data-title="${esc(v.title)}">
            <span class="ep__thumb"><img src="${v.thumb}" width="1280" height="720" alt="" loading="lazy" decoding="async"><span class="player__dur">${clock(v.length)}</span></span>
            <span class="ep__title">${esc(v.title)}</span>
            <span class="ep__meta">${v.views >= SHOW_VIEWS_FROM ? `${views(v.views)} views · ` : ''}${day(v.date)}</span>
          </a>`);
  const html = `<!-- VIDEOS:START -->${feature}${cards.length ? `
        <div class="reel" data-stagger>${cards.join('')}
        </div>` : ''}
        <!-- VIDEOS:END -->`;
  const latestHtml = `<!-- LATEST:START -->
        <a class="cover-line" href="https://www.youtube.com/watch?v=${latest.id}" data-ep="${latest.id}" data-title="${esc(latest.title)}" data-hero-in>
          <span class="cover-line__tag">Latest</span>
          <span>${esc(latest.title)}</span>
          <svg class="ico" aria-hidden="true"><use href="#i-play"/></svg>
        </a>
        <!-- LATEST:END -->`;

  /* ---- structured data ---- */
  const ld = top.map((v) => `      {
        "@type": "VideoObject",
        "@id": "${SITE}/#video-${v.id}",
        "name": ${jsonStr(v.title)},
        "description": ${jsonStr(v.summary)},
        "thumbnailUrl": ["${v.thumbJpg}", "https://i.ytimg.com/vi/${v.id}/hqdefault.jpg"],
        "uploadDate": "${v.date}",
        "duration": "PT${Math.floor(v.length / 60)}M${v.length % 60}S",
        "contentUrl": "https://www.youtube.com/watch?v=${v.id}",
        "embedUrl": "https://www.youtube-nocookie.com/embed/${v.id}",
        "inLanguage": "en",
        "isFamilyFriendly": true,
        "interactionStatistic": { "@type": "InteractionCounter", "interactionType": { "@type": "WatchAction" }, "userInteractionCount": ${v.views} },
        "publisher": { "@type": "Organization", "@id": "${SITE}/#org", "name": "Faceless Man Talks", "logo": { "@type": "ImageObject", "url": "${SITE}/assets/icons/icon-512.png" } }${v.chapters.length ? `,
        "hasPart": [
${v.chapters.map((c) => `          { "@type": "Clip", "name": ${jsonStr(c.name)}, "startOffset": ${c.t}, "endOffset": ${c.end}, "url": "https://www.youtube.com/watch?v=${v.id}&t=${c.t}s" }`).join(',\n')}
        ]` : ''}
      }`).join(',\n');
  const ldBlock = `<!-- VIDEOS-LD:START (generated by tools/update-videos.mjs) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
${ld}
    ]
  }
  </script>
  <!-- VIDEOS-LD:END -->`;
  JSON.parse(ldBlock.slice(ldBlock.indexOf('{'), ldBlock.lastIndexOf('}') + 1)); // sanity check

  const sitemapVideos = `<!-- VIDEOS-SITEMAP:START -->
${top.map((v) => `    <video:video>
      <video:thumbnail_loc>${esc(v.thumbJpg)}</video:thumbnail_loc>
      <video:title>${esc(v.title)}</video:title>
      <video:description>${esc(v.summary)}</video:description>
      <video:player_loc>https://www.youtube-nocookie.com/embed/${v.id}</video:player_loc>
      <video:duration>${v.length}</video:duration>
      <video:publication_date>${v.date}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>`).join('\n')}
    <!-- VIDEOS-SITEMAP:END -->`;

  if (DRY) { console.log(`\nWould feature: ${best.title}\nThen: ${rest.map((v) => v.title).join(' | ') || '(nothing else yet)'}`); return; }

  const replaceBlock = (text, start, end, block) => {
    const a = text.indexOf(start), b = text.indexOf(end);
    if (a < 0 || b < 0) throw new Error(`Markers ${start} … ${end} not found.`);
    return text.slice(0, a) + block + text.slice(b + end.length);
  };
  const today = new Date().toISOString().slice(0, 10);
  const indexPath = path.join(ROOT, 'index.html');
  let index = await readFile(indexPath, 'utf8');
  index = replaceBlock(index, '<!-- VIDEOS:START -->', '<!-- VIDEOS:END -->', html);
  index = replaceBlock(index, '<!-- VIDEOS-LD:START', '<!-- VIDEOS-LD:END -->', ldBlock);
  index = replaceBlock(index, '<!-- LATEST:START -->', '<!-- LATEST:END -->', latestHtml);
  index = index.replace(/"dateModified": "\d{4}-\d{2}-\d{2}"/, `"dateModified": "${today}"`);
  await writeFile(indexPath, index);
  const smPath = path.join(ROOT, 'sitemap.xml');
  let sm = await readFile(smPath, 'utf8');
  sm = replaceBlock(sm, '<!-- VIDEOS-SITEMAP:START -->', '<!-- VIDEOS-SITEMAP:END -->', sitemapVideos);
  sm = sm.replace(/<lastmod>[^<]+<\/lastmod>/, `<lastmod>${today}</lastmod>`);
  await writeFile(smPath, sm);
  console.log(`\nDone. Featured "${best.title}" plus ${rest.length} more. index.html and sitemap.xml updated.`);
}

main().catch((e) => { console.error(`\nUpdate failed: ${e.message}\nNothing was changed.`); process.exit(1); });
