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
| `.github/workflows/update-videos.yml` | Runs that refresh automatically every 6 hours on GitHub |
| `tools/og-image.html` | Source of the social share picture |

## Preview it on your computer

```bash
python tools/serve.py
```

Then open http://127.0.0.1:5173. Videos only play when the page is served like this (or online), not when you double-click `index.html`.

## Videos update themselves

`tools/update-videos.mjs` reads your channel and rebuilds the video section:

- **Big player:** your most watched long-form video, with its chapters.
- **Small cards:** your newest video first (tagged "New" for 2 weeks), then your next most watched.
- **"Latest" link at the top of the page:** always your newest video.
- Shorts, live streams and scheduled premieres are skipped. View counts only show once a video passes 1,000 views.

You can run it by hand any time (`--dry` shows what it would do without changing anything):

```bash
node tools/update-videos.mjs
```

### It's automatic

The file `.github/workflows/update-videos.yml` runs the updater every 6 hours on GitHub, for free, using
YouTube's public feed (no API key). When something changed it commits the page, and GitHub Pages republishes
https://facelessmantalks.com a minute later. To update right away after uploading a video:
*Actions* tab > **Update videos from YouTube** > **Run workflow**.

## Notes

1. **Domain.** The site is live at https://facelessmantalks.com (set by the `CNAME` file). If the domain ever
   changes, find and replace it in `index.html`, `sitemap.xml`, `robots.txt` and `tools/update-videos.mjs`.
2. **Hosting:** GitHub Pages publishes the `main` branch of the repository. `desktop.ini` and `.claude/` stay
   on your computer (see `.gitignore`).
3. **Google Search Console:** add the domain, then submit `sitemap.xml`.
4. **Link everything together:** put the site URL in YouTube Studio (Customization > Basic info > Links) and in the
   Instagram bio. Links from your own channel help Google trust the site.
5. When you change `style.css` or `script.js` later, bump the `?v=4` after their names in `index.html`
   (and `404.html`), so returning visitors get the new version.

## Editing the words

All copy lives in `index.html`. Each section is marked with a comment like `<!-- ============ 02 ABOUT + TOPICS ============ -->`.
The wording is kept humble on purpose (a personal learning journey, no promises about prices or upload habits),
so it stays true as the channel changes. The lines the character says when you tap his face are near the top of
`script.js` (search for `const lines`).
