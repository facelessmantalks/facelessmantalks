# Faceless Man Talks — website

A short, fast, mobile-first page for the Faceless Man Talks YouTube channel.
Plain HTML, CSS and JavaScript: no frameworks, no build step, no tracking.

The page has six parts: the cover, the latest video, a short "about" with three topic cards,
the compound calculator, a friendly subscribe section and the footer. On a phone it is about
six screens tall.

## What's where

| File | What it is |
| --- | --- |
| `index.html` | The whole page, plus SEO tags and structured data |
| `style.css` | All styles (mobile first, then tablet and desktop) |
| `script.js` | Animations and interactive parts |
| `404.html` | "This page went faceless" error page |
| `robots.txt`, `sitemap.xml`, `site.webmanifest` | Search engines and "add to home screen" |
| `assets/img/` | Hero bust, the 12 poses, share image (`og-image.jpg`) |
| `assets/icons/`, `favicon.ico` | Browser and phone icons |
| `assets/fonts/` | Self-hosted fonts (Fraunces, Hanken Grotesk, IBM Plex Mono) |
| `tools/serve.py` | Local preview server |
| `tools/update-videos.mjs` | Refreshes the video section from YouTube |
| `tools/og-image.html` | Source of the social share picture |

## Preview it on your computer

```bash
python tools/serve.py
```

Then open http://127.0.0.1:5173. Videos only play when the page is served like this (or online), not when you double-click `index.html`.

## When you publish new videos

```bash
node tools/update-videos.mjs
```

It reads your public channel, ranks the videos by views, puts the most watched one in the big player (with its
chapters), lists a few more as swipeable cards, points the "Latest" link at the top of the page to your newest video,
and updates the video data Google reads. View counts only show on the page once a video passes 1,000 views.
Add `--dry` to preview the result without changing anything.

## Before going live (important)

1. **Domain.** The site uses `https://www.facelessmantalks.com` as a placeholder. If your domain is different,
   find and replace it in `index.html`, `sitemap.xml` and `robots.txt`.
2. **Host it** on Netlify, Cloudflare Pages, Vercel or GitHub Pages: upload the folder as it is.
   `desktop.ini` and `.claude/` don't need to go online. `404.html` expects the site at the root of the domain.
3. **Google Search Console:** add the domain, then submit `sitemap.xml`.
4. **Link everything together:** put the site URL in YouTube Studio (Customization > Basic info > Links) and in the
   Instagram bio. Links from your own channel help Google trust the site.
5. When you change `style.css` or `script.js` later, bump the `?v=3` after their names in `index.html`
   (and `404.html`), so returning visitors get the new version.

## Editing the words

All copy lives in `index.html`. Each section is marked with a comment like `<!-- ============ 02 ABOUT + TOPICS ============ -->`.
The wording is kept humble on purpose (a personal learning journey, no promises about prices or upload habits),
so it stays true as the channel changes. The lines the character says when you tap his face are near the top of
`script.js` (search for `const lines`).
