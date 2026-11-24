#!/usr/bin/env node
/**
 * Refresh the video section of the site from the YouTube channel.
 *
 *   node tools/update-videos.mjs            rewrite index.html + sitemap.xml (only if something changed)
 *   node tools/update-videos.mjs --dry      print what it found, change nothing
 *   node tools/update-videos.mjs --max 5    how many videos to show in total (default 5: 1 big + 4 cards)
 *
 * What ends up on the page:
 *   - the big player:   the MOST WATCHED long-form video (with its chapters)
 *   - first small card: the NEWEST long-form video, tagged "Latest" (when it isn't the big one already)
 *   - more small cards: the next most watched videos
 *   - the "Latest" link at the top of the page always points at the newest video
 * Shorts, live streams and scheduled premieres are skipped.
 *
 * Where the data comes from (no account or key needed):
 *   - YouTube's public feed of the channel's long-form videos (Shorts are not in it).
 *     It lists the newest 15 videos with their view counts.
 *   - tools/videos.json remembers every video seen so far, so older videos stay on the
 *     page after they drop out of the feed (their view counts are the last ones seen).
 *   - If the feed fails, it reads the channel's public pages instead.
 *   - Optional: if a YOUTUBE_API_KEY environment variable is set, the official API is used.
 * Only the parts between the VIDEOS / LATEST markers are replaced.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CHANNEL_ID = 'UC9gM08bPptqc3I0oizeXnEw';
const CHANNEL = 'https://www.youtube.com/@FacelessManTalks';
const SITE = 'https://facelessmantalks.com';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE = path.join(ROOT, 'tools', 'videos.json');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const MAX = Math.max(1, parseInt(args[args.indexOf('--max') + 1], 10) || 5);
const API_KEY = (process.env.YOUTUBE_API_KEY || '').trim();
// view counts are only printed on the page once a video has at least this many
const SHOW_VIEWS_FROM = 1000;
// a video counts as "new" for this many days
const NEW_DAYS = 14;

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'CONSENT=YES+1; SOCS=CAI'
};

/* ---------------------------------------------------------------- helpers */
async function get(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} for ${url.replace(/key=[^&]+/, 'key=…')}`);
  return r.text();
}
async function getJson(url) { return JSON.parse(await get(url)); }
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
const clock = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };
const human = (sec) => { const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`; };
const views = (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const isoSeconds = (d) => { const m = String(d).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) : 0; };

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
/** YouTube answers /shorts/ID with a page for Shorts and a redirect to /watch for normal videos. */
async function isShort(id, length) {
  if (length > 180) return false;
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual', headers: HEADERS });
    if (r.status === 200) return true;
    if (r.status >= 300 && r.status < 400) return false;
  } catch { /* fall through */ }
  return length <= 60;
}

/* ---------------------------------------------------------------- source 1: public feed (default) */
const unxml = (t) => String(t || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? unxml(m[1].trim()) : ''; };
async function fromFeed() {
  // "UULF…" is YouTube's own playlist of a channel's long-form videos (no Shorts, no lives)
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${CHANNEL_ID.slice(2)}`);
  return xml.split('<entry>').slice(1).map((e) => ({
    id: tag(e, 'yt:videoId'), title: tag(e, 'title'), date: tag(e, 'published'),
    desc: tag(e, 'media:description'), views: parseInt((e.match(/views="(\d+)"/) || [])[1], 10) || 0
  })).filter((v) => v.id);
}
/** Length in seconds from the video page (0 if YouTube won't say, e.g. when it blocks servers). */
async function lengthOf(id) {
  try {
    const html = await get(`https://www.youtube.com/watch?v=${id}`);
    if (/"isUpcoming":true/.test(html)) return -1;
    return parseInt((html.match(/"lengthSeconds":"(\d+)"/) || [])[1], 10) || 0;
  } catch { return 0; }
}
/** false when a video was deleted or made private */
async function stillPublic(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`, { headers: HEADERS });
    return !(r.status === 401 || r.status === 403 || r.status === 404);
  } catch { return true; }
}

/* ---------------------------------------------------------------- source 2 (optional): YouTube Data API */
async function fromApi() {
  const api = (p) => `https://www.googleapis.com/youtube/v3/${p}&key=${encodeURIComponent(API_KEY)}`;
  const uploads = 'UU' + CHANNEL_ID.slice(2);
  const ids = [];
  let token = '';
  for (let page = 0; page < 6; page++) {
    const d = await getJson(api(`playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${token ? `&pageToken=${token}` : ''}`));
    (d.items || []).forEach((it) => ids.push(it.contentDetails.videoId));
    if (!d.nextPageToken) break;
    token = d.nextPageToken;
  }
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await getJson(api(`videos?part=snippet,contentDetails,statistics,status&id=${ids.slice(i, i + 50).join(',')}`));
    for (const v of d.items || []) {
      if (v.status.privacyStatus !== 'public' || v.snippet.liveBroadcastContent !== 'none') continue;
      const length = isoSeconds(v.contentDetails.duration);
      if (!length || await isShort(v.id, length)) continue;
      out.push({
        id: v.id, title: v.snippet.title, length, views: parseInt(v.statistics.viewCount, 10) || 0,
        date: v.snippet.publishedAt, desc: v.snippet.description || '', hasMax: !!(v.snippet.thumbnails || {}).maxres
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- source 3: public channel pages */
async function fromPages() {
  // the /videos tab only lists long-form uploads (Shorts live on their own tab)
  const list = pageJson(await get(`${CHANNEL}/videos`), 'ytInitialData');
  if (!list) throw new Error('Could not read the channel page (YouTube may have changed its layout, or blocked this computer).');
  const ids = new Set();
  collect(list, 'videoRenderer').forEach((v) => v.videoId && ids.add(v.videoId));
  collect(list, 'lockupViewModel').forEach((v) => v.contentId && ids.add(v.contentId));
  const out = [];
  for (const id of ids) {
    const p = pageJson(await get(`https://www.youtube.com/watch?v=${id}`), 'ytInitialPlayerResponse');
    const d = p && p.videoDetails;
    if (!d || d.isLiveContent || d.isUpcoming) continue;
    const mf = (p.microformat && p.microformat.playerMicroformatRenderer) || {};
    out.push({
      id, title: d.title, length: parseInt(d.lengthSeconds, 10) || 0, views: parseInt(d.viewCount, 10) || 0,
      date: mf.publishDate || mf.uploadDate || new Date().toISOString(), desc: d.shortDescription || '',
      hasMax: await exists(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`)
    });
  }
  return out;
}

/* ---------------------------------------------------------------- build */
async function main() {
  let store = {};
  try { store = JSON.parse(await readFile(STORE, 'utf8')); } catch { /* first run */ }
  const oldStore = JSON.stringify(store, null, 1);
  let fresh, complete;
  if (API_KEY) {
    console.log('Reading the channel with the YouTube Data API …');
    fresh = await fromApi(); complete = true;
  } else {
    try {
      console.log("Reading the channel's public feed …");
      fresh = await fromFeed(); complete = false;
    } catch (e) {
      console.log(`Feed failed (${e.message}), reading ${CHANNEL}/videos instead …`);
      fresh = await fromPages(); complete = true;
    }
  }
  for (const v of fresh) {
    const known = store[v.id] || {};
    let length = v.length || known.length || 0;
    if (!length) length = await lengthOf(v.id);
    if (length < 0) continue; // a scheduled premiere: add it once it's out
    const hasMax = v.hasMax != null ? v.hasMax : known.hasMax != null ? known.hasMax : await exists(`https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`);
    store[v.id] = { title: v.title, date: v.date, views: v.views, length, hasMax, desc: v.desc };
  }
  const freshIds = new Set(fresh.map((v) => v.id));
  for (const id of Object.keys(store)) {
    if (freshIds.has(id)) continue;
    if (complete || !(await stillPublic(id))) { console.log(`  removed (no longer public): ${store[id].title}`); delete store[id]; }
  }
  const raw = Object.entries(store).map(([id, v]) => ({ id, ...v }));
  if (!raw.length) throw new Error('No public long-form videos found on the channel.');
  const videos = raw.map((v) => ({
    ...v,
    summary: summary(v.desc), chapters: chaptersFrom(v.desc, v.length),
    thumb: v.hasMax ? `https://i.ytimg.com/vi_webp/${v.id}/maxresdefault.webp` : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    thumbJpg: v.hasMax ? `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg` : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
  }));
  const byViews = [...videos].sort((a, b) => b.views - a.views || new Date(b.date) - new Date(a.date));
  const byDate = [...videos].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const v of byDate) console.log(`  ${views(v.views).padStart(6)} views  ${day(v.date).padEnd(13)} ${v.title}`);

  const best = byViews[0];
  const latest = byDate[0];
  const latestIsBest = latest.id === best.id;
  // small cards: the newest one first (if it isn't the big one), then the next most watched
  const rest = [];
  if (!latestIsBest) rest.push(latest);
  for (const v of byViews) { if (rest.length >= MAX - 1) break; if (v.id !== best.id && v.id !== latest.id) rest.push(v); }
  const shown = [best, ...rest];
  const isNew = (v) => Date.now() - new Date(v.date).getTime() < NEW_DAYS * 864e5;

  /* ---- HTML ---- */
  const label = videos.length === 1 ? 'Latest episode' : latestIsBest ? 'Latest and most watched' : 'Most watched so far';
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
              ${best.length ? `<span class="player__dur">${clock(best.length)}</span>` : ''}
            </button>
          </div>
          <div class="feature__body">
            <p class="feature__label"><span>${label}</span>${isNew(best) ? '<span class="badge-new">New</span>' : ''}</p>
            <h3 class="feature__title" id="v-${best.id}">${esc(best.title)}</h3>
            <p class="feature__meta"><time datetime="${best.date.slice(0, 10)}">${day(best.date)}</time>${best.length ? `<span aria-hidden="true">·</span>${human(best.length)}` : ''}${best.views >= SHOW_VIEWS_FROM ? `<span aria-hidden="true">·</span>${views(best.views)} views` : ''}</p>
            <p class="feature__desc">${esc(best.summary)}</p>${chapters}
            <a class="link-arrow" href="https://www.youtube.com/watch?v=${best.id}" target="_blank" rel="noopener">Watch on YouTube <svg class="ico" aria-hidden="true"><use href="#i-out"/></svg></a>
          </div>
        </article>`;
  const cards = rest.map((v) => {
    const badge = v.id === latest.id ? `<span class="ep__tag">${isNew(v) ? 'New' : 'Latest'}</span>` : '';
    return `
          <a class="ep" href="https://www.youtube.com/watch?v=${v.id}" data-reveal data-ep="${v.id}" data-title="${esc(v.title)}">
            <span class="ep__thumb"><img src="${v.thumb}" width="1280" height="720" alt="" loading="lazy" decoding="async">${badge}${v.length ? `<span class="player__dur">${clock(v.length)}</span>` : ''}</span>
            <span class="ep__title">${esc(v.title)}</span>
            <span class="ep__meta">${v.views >= SHOW_VIEWS_FROM ? `${views(v.views)} views · ` : ''}${day(v.date)}</span>
          </a>`;
  });
  const html = `<!-- VIDEOS:START -->${feature}${cards.length ? `
        <div class="reel" data-stagger>${cards.join('')}
        </div>` : ''}
        <!-- VIDEOS:END -->`;
  const latestHtml = `<!-- LATEST:START -->
        <a class="cover-line" href="https://www.youtube.com/watch?v=${latest.id}" data-ep="${latest.id}" data-title="${esc(latest.title)}" data-hero-in>
          <span class="cover-line__tag">${isNew(latest) ? 'New' : 'Latest'}</span>
          <span>${esc(latest.title)}</span>
          <svg class="ico" aria-hidden="true"><use href="#i-play"/></svg>
        </a>
        <!-- LATEST:END -->`;

  /* ---- structured data ---- */
  const ld = shown.map((v) => `      {
        "@type": "VideoObject",
        "@id": "${SITE}/#video-${v.id}",
        "name": ${jsonStr(v.title)},
        "description": ${jsonStr(v.summary || v.title)},
        "thumbnailUrl": ["${v.thumbJpg}", "https://i.ytimg.com/vi/${v.id}/hqdefault.jpg"],
        "uploadDate": "${v.date}",
${v.length ? `        "duration": "PT${Math.floor(v.length / 60)}M${v.length % 60}S",
` : ''}        "contentUrl": "https://www.youtube.com/watch?v=${v.id}",
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
${shown.map((v) => `    <video:video>
      <video:thumbnail_loc>${esc(v.thumbJpg)}</video:thumbnail_loc>
      <video:title>${esc(v.title)}</video:title>
      <video:description>${esc(v.summary || v.title)}</video:description>
      <video:player_loc>https://www.youtube-nocookie.com/embed/${v.id}</video:player_loc>
${v.length ? `      <video:duration>${v.length}</video:duration>\n` : ''}      <video:publication_date>${v.date}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>`).join('\n')}
    <!-- VIDEOS-SITEMAP:END -->`;

  console.log(`\nBig player (most watched): ${best.title}\nLatest:                    ${latest.title}\nSmall cards:               ${rest.map((v) => v.title).join(' | ') || '(none yet)'}`);
  if (DRY) return;

  /* ---- write, only when something actually changed ---- */
  const replaceBlock = (text, start, end, block) => {
    const a = text.indexOf(start), b = text.indexOf(end);
    if (a < 0 || b < 0) throw new Error(`Markers ${start} … ${end} not found.`);
    return text.slice(0, a) + block + text.slice(b + end.length);
  };
  const today = new Date().toISOString().slice(0, 10);
  const indexPath = path.join(ROOT, 'index.html');
  const smPath = path.join(ROOT, 'sitemap.xml');
  const oldIndex = await readFile(indexPath, 'utf8');
  const oldSm = await readFile(smPath, 'utf8');
  let index = replaceBlock(oldIndex, '<!-- VIDEOS:START -->', '<!-- VIDEOS:END -->', html);
  index = replaceBlock(index, '<!-- VIDEOS-LD:START', '<!-- VIDEOS-LD:END -->', ldBlock);
  index = replaceBlock(index, '<!-- LATEST:START -->', '<!-- LATEST:END -->', latestHtml);
  let sm = replaceBlock(oldSm, '<!-- VIDEOS-SITEMAP:START -->', '<!-- VIDEOS-SITEMAP:END -->', sitemapVideos);
  const newStore = JSON.stringify(store, null, 1);
  if (newStore !== oldStore) await writeFile(STORE, newStore + '\n');
  if (index === oldIndex && sm === oldSm) { console.log('\nNothing changed on the page since the last update.'); return; }
  index = index.replace(/"dateModified": "\d{4}-\d{2}-\d{2}"/, `"dateModified": "${today}"`);
  sm = sm.replace(/<lastmod>[^<]+<\/lastmod>/, `<lastmod>${today}</lastmod>`);
  await writeFile(indexPath, index);
  await writeFile(smPath, sm);
  console.log('\nDone. index.html and sitemap.xml updated.');
}

main().catch((e) => { console.error(`\nUpdate failed: ${e.message}\nNothing was changed.`); process.exit(1); });
