# Deploying the site

The site is static files on Cloudflare Pages, live at `https://electrontointerface.com`, with no backend (ADR 0002). The domain is registered with Cloudflare Registrar, a fixed yearly price (ADR 0001).

## How a deploy happens

- Every push to `main` runs the `deploy` job in `.github/workflows/ci.yml`, after the typecheck, Vitest, Playwright and pytest jobs pass.
- The job runs `npm run build` and uploads `app/dist` to the Pages project `electrontointerface` with Wrangler. The first deploy creates the project.
- It then waits, up to 5 minutes, until that deploy's own URL answers over HTTPS, and runs the smoke test, `app/e2e/live/smoke.spec.ts`, against it. It checks that `/zoom/7` loads the app, that hello world runs on Python 3.14.2 served from the same site, that Pyodide's files are cached for a year, that the link-preview image is served, that Web Analytics counts each zoom level's path but never sends what follows `#`, where a Share link carries the learner's code, and that the page and the worker can't fetch from other sites (`app/e2e/live/lockdown.spec.ts`). Any smoke test fails if the page breaks its Content Security Policy.
- The job needs two GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, a token allowed only to edit Cloudflare Pages, and `CLOUDFLARE_ACCOUNT_ID`.

To run the smoke test by hand, from `app/`:

```
LIVE_URL=https://electrontointerface.com npx playwright test --config playwright.live.config.ts
```

## What Pages does with the files

- **Deep links:** with no `404.html` at the top of the build, Pages answers any path that isn't a file with `index.html`, so `/zoom/7` loads the app. Don't add a top-level `404.html`.
- **Caching:** `app/public/_headers` lets browsers keep `assets/` and `pyodide/` for a year. Vite puts a hash in each `assets/` file name, and Pyodide's files sit under their version, `pyodide/314.0.7/`, so a changed file always has a new path. Everything else, `index.html` and the Example Analyses included, is checked for a newer copy on every visit.
- **Limits:** Pages takes files up to 25 MiB and 20,000 files per site on the free plan. The largest file, `pyodide.asm.wasm`, is 9.6 MB, and the build has about 20 files.

## Content Security Policy

`app/public/_headers` gives every page a Content Security Policy. The page may load and connect only to our own site, plus Web Analytics' script and reports. The Web Worker that runs the learner's code, under `assets/worker/`, gets a second policy on top that allows connections only to our own site. Pages joins the two with a comma, and the browser enforces both. If Cloudflare starts adding another script, or the beacon moves, the smoke test fails, and the policy needs the new address.

## Analytics

Cloudflare Web Analytics is turned on in the Pages project (Metrics, then Web Analytics), and Pages adds its script to each deploy. It sets no cookies. Each zoom level, `/zoom/1` to `/zoom/9`, counts as its own page view, which measures zoom depth (ADR 0002). It sends the path without the fragment, so a Share link's code stays in the browser (ADR 0004); the smoke test checks this on every deploy, since the script is Cloudflare's and can change. The script loads from `https://static.cloudflareinsights.com/beacon.min.js` and reports to `https://cloudflareinsights.com/cdn-cgi/rum`, which the Content Security Policy allows.

## Link previews

LinkedIn, Slack, X and chat apps build a preview card for a link from tags in `app/index.html`: a description, and Open Graph's `og:title`, `og:description` and `og:image`. Crawlers need absolute URLs, so the tags name `https://electrontointerface.com`. The image, `app/public/og-image.png`, is a 1200 × 630 screenshot of `/zoom/2` in the light theme, taken at a 1200 × 630 window. Retake it when that view changes. A Share link gets the same card, since crawlers never receive what follows `#`.

LinkedIn keeps a preview for about 7 days. After changing the tags or the image, paste the address into LinkedIn's Post Inspector (`https://www.linkedin.com/post-inspector/`), which fetches it afresh and shows the card. Do this before posting a link.

## Launch checklist

All done on 2026-10-06.

1. Buy `electrontointerface.com` with Cloudflare Registrar, with auto-renew and the transfer lock on.
2. Create the API token and add both secrets to GitHub.
3. Push to `main`, and check that the `deploy` job passes. The site is then at `electrontointerface.pages.dev`.
4. In the Pages project, add `electrontointerface.com` as a custom domain. For `www`, add a proxied `A` record, `www` to `192.0.2.1`, and a Redirect Rule sending `https://www.electrontointerface.com/*` to `https://electrontointerface.com/${1}` with a 301, keeping the query string.
5. Turn on Web Analytics in the Pages project, then deploy again (rerun the job), since Pages adds the script on the next deploy.
6. Run the smoke test against `https://electrontointerface.com`.
