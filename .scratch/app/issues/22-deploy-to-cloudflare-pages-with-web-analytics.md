# 22: Deploy to Cloudflare Pages, with Web Analytics

**What to build:** The app is live on the web as a static site, at zero running cost, and page views per zoom level are counted without cookies.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser

**Status:** ready-for-agent

**Needs a human for:** creating the Cloudflare account and Pages project and adding the deploy token to GitHub secrets. The domain name is still an open question.

- [ ] GitHub Actions deploys the static build to Cloudflare Pages on every push to the main branch. There is no backend (ADR 0002).
- [ ] Deep links such as `/zoom/7` load the app.
- [ ] Cloudflare Web Analytics counts page paths only, so zoom depth can be measured (ADR 0002).
- [ ] Only services with a hard stop are used (ADR 0001).
