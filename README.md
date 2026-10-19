# muste

Personal iPad-first app for working through *Suomen Mestari* with the Apple Pencil:
write in the book, tap any word for a translation and grammar breakdown.

The textbook PDFs are scans (one JPEG per page, no text layer), so lookups send a
small crop of the page to Claude, which reads the Finnish and explains it.
PDFs and ink stay in the browser's IndexedDB and are never uploaded.

## Using it

| Gesture | Does |
| --- | --- |
| Pencil, **Pen** tool | Write |
| Pencil, **Eraser** tool | Erase whole strokes it touches |
| Pencil drag, **Explain area** tool | Explain everything in the box |
| Finger tap on a word | Explain that word (any tool) |
| Finger drag / pinch | Scroll / zoom |

Explanations are cached on the device, so tapping the same spot again is free.

## Run it on the iPad over your LAN

```sh
npm install
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local
npm run dev
```

Open the `Network:` URL Vite prints (https, self-signed) on the iPad, accept the
certificate warning, then tap **Open PDF**.

What to check on the iPad:
- **Ink latency**: write a few short answers. Is the lag acceptable?
- **Palm rejection**: rest your hand on the screen while writing. No stray marks or scrolling?
- **Scroll vs draw**: one finger scrolls, two pinch-zoom, the Pencil only draws.
- **Tap to explain**: tap a word with a finger. The sheet should name the word you tapped.

## Deploy to muste.matt-pasek.dev (private)

Static app on Cloudflare Pages, `/api/explain` as a Pages Function holding the API
key, and the whole thing behind Cloudflare Access so only you can open it.

1. `npx wrangler login`, then `npm run deploy` (creates the `muste` Pages project on first run).
2. `npx wrangler pages secret put ANTHROPIC_API_KEY --project-name muste`, then `npm run deploy` again.
3. Cloudflare dashboard → Workers & Pages → muste → Custom domains → add `muste.matt-pasek.dev`.
4. Zero Trust → Access → Applications → Add → Self-hosted. Add two public hostnames,
   `muste.matt-pasek.dev` and `muste.pages.dev` (plus `*.muste.pages.dev` for preview
   deploys), with a policy **Allow → Emails → your address**. Login is a one-time email code.
5. On the iPad, open the site in Safari → Share → Add to Home Screen.

Spend: each lookup logs its token usage in the function logs
(`npx wrangler pages deployment tail --project-name muste`). Set a monthly limit in the
Anthropic Console as a backstop.
