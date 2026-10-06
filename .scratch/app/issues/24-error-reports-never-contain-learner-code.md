# 24: Error reports never contain learner code

**What to build:** We learn about our own bugs without ever receiving a learner's code, Facts or values (ADR 0004).

**Blocked by:** 19: Code editor, file upload and the 20-line limit; 22: Deploy to Cloudflare Pages, with Web Analytics

**Status:** ready-for-agent

- [ ] Sentry on its free tier, which drops events past its quota, sends only our own JavaScript stack traces: no editor contents, no Python values, and no breadcrumbs that could include either.
- [ ] An automated test puts a marker string in the editor, triggers an error, and fails if the marker appears in the outgoing report.
- [ ] A "Report a problem" button opens a prefilled GitHub issue, and the learner decides what to include.

## Comments

- Ticket 21: a Share link carries the Program in the URL fragment (`/zoom/1#code=…`), and the fragment stays in the address at every zoom level until an Example or an upload replaces the link's Program. Sentry's browser SDK puts the page's address in each report, so the fragment must be cut from it, and the marker test should also open a Share link that carries the marker.
