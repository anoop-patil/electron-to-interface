# 22: Deploy to Cloudflare Pages, with Web Analytics

**What to build:** The app is live on the web as a static site, at zero running cost, and page views per zoom level are counted without cookies.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser

**Status:** ready-for-agent

**Decide first:** deployment is decided after tickets 01–21 are built and running locally. At that point, settle the domain name, check Cloudflare Pages' file-size and file-count limits against the Pyodide files (the app serves 4; the largest, `pyodide.asm.wasm`, is 9.6 MB), set long-lived caching for them, and add a launch checklist ending in a smoke test against the live URL.

**Needs a human for:** adding the deploy token to GitHub secrets, then linking the domain and turning on Web Analytics in the Pages project after the first deploy (`docs/deploy.md`, Launch checklist).

- [ ] GitHub Actions deploys the static build to Cloudflare Pages on every push to the main branch. There is no backend (ADR 0002).
- [ ] Deep links such as `/zoom/7` load the app.
- [ ] Cloudflare Web Analytics counts page paths only, so zoom depth can be measured (ADR 0002).
- [x] Only services with a hard stop are used (ADR 0001).

## Comments

- Ticket 16: `npm run build` now also runs Pyodide under Node.js to make each Example's Analysis (`src/examples/build.ts`), into `public/examples/`, which the site serves as static files. It adds a few seconds and needs no network.
- Ticket 21: a Share link carries the Program in the URL fragment (`/zoom/1#code=…`), and the fragment stays in the address at every zoom level until an Example or an upload replaces the link's Program. Whether the Web Analytics beacon sends the fragment hasn't been checked; it must count paths only.
- Ticket 22, first part: the domain is `electrontointerface.com`, bought with Cloudflare Registrar. The `deploy` job in `ci.yml` builds and uploads the site with Wrangler after every check passes, creating the Pages project `electrontointerface` on its first run, then smoke-tests that deploy (`app/e2e/live/smoke.spec.ts`). Pyodide moved to `pyodide/<version>/`, so `app/public/_headers` can cache it for a year. The limits fit: 25 MiB per file and 20,000 files, against 9.6 MB and about 20. Deep links need no rule: with no top-level `404.html`, Pages serves `index.html`. The other boxes get ticked once the first deploy and the launch checklist pass.
