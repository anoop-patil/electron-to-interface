# Learner code never leaves the browser

We promise learners that their code never leaves their browser, and we treat that as a hard constraint rather than a slogan. No request we make may contain the learner's program, its Facts or its runtime values. The one exception is a Share link, which carries the program in the URL fragment; browsers never send the fragment to a server. The promise costs nothing (there is no backend) and removes any need for accounts, stored data or a privacy burden.

## Consequences

- Error monitoring (Sentry's free tier) sends only our own JavaScript stack traces: no editor contents, no Python values, no breadcrumbs that could include either. An automated test puts a marker string in the editor, triggers an error and fails if the marker appears in the outgoing report.
- Analytics (Cloudflare Web Analytics) sees only page paths such as `/zoom/7`, never code.
- A "Report a problem" button opens a prefilled GitHub issue, and the learner decides what to include.
- Pyodide is served from our own domain, not a third-party CDN, and the Content Security Policy allows connections only to our own domain.
