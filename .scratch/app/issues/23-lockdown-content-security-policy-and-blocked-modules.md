# 23: Lockdown: Content Security Policy and blocked modules

**What to build:** Code a learner runs, including code arriving through a Share link, can't use their browser to reach other sites.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser; 22: Deploy to Cloudflare Pages, with Web Analytics

**Status:** ready-for-agent

- [x] A Content Security Policy on the page and the worker allows connections only to our own domain. It's verified on the deployed site and in a Playwright test.
- [x] `js`, `pyodide` and `micropip` are blocked in the Python that runs user code, so `import js` fails with a friendly message.

## Comments

- Ticket 22: Pages adds Cloudflare Web Analytics' script to each deploy. The policy must let the page load `https://static.cloudflareinsights.com/beacon.min.js` and connect to `https://cloudflareinsights.com`, where it reports (`/cdn-cgi/rum`), as observed on the live site. The live smoke test fails if the beacon stops reporting, so it will catch a policy that blocks it.

Built in `app/`. Decisions made along the way:

- The policy is a header, in `app/public/_headers`, which Pages reads. A `<meta>` tag couldn't do it: a worker takes its policy only from the headers its own script is served with.
- The page may load and connect only to our own site, plus Web Analytics: its script from `static.cloudflareinsights.com`, its reports to `cloudflareinsights.com`. `'wasm-unsafe-eval'` lets Pyodide start its WebAssembly; nothing may use `eval`.
- Styles may be inline (`style-src 'unsafe-inline'`). CodeMirror adds its styles in a `<style>` element, and a static site can't hand out the per-visit nonce that would avoid it. A style still can't load anything from another site, since images and fonts come only from ours.
- The worker that runs the learner's code gets a second policy on top, with `connect-src 'self'`, so it can't reach Web Analytics either: a report sent there goes to whichever Web Analytics account it names. Vite now writes the worker's files to `assets/worker/`, which `_headers` matches. Pages sends the worker's script with a `Content-Security-Policy` header for each rule, and the browser enforces both policies.
- `vite preview` sends the same headers (`src/pagesHeaders.ts` reads `_headers`), so the Playwright tests run under the policy. The dev server doesn't, since Vite's hot reload needs an inline script.
- `e2e/lockdown.spec.ts` fetches from another site, in the page and in the worker, and checks the browser refuses it under `connect-src`. The worker can't reach Web Analytics, and both can fetch from our own site. `e2e/live/lockdown.spec.ts` checks the same on each deploy. Every other e2e test, and the smoke test, fails if the page breaks the policy (`e2e/test.ts`), since the browser reports each refusal on the console.
- While the Program or a Try it yourself command runs, the analyzer swaps `builtins.__import__` and `importlib.import_module` for versions that refuse `js`, `pyodide`, `micropip` and `pyodide_js`, which hands Python the JavaScript side of Pyodide: `ModuleNotFoundError: js is blocked here, so a program can't use your browser`. The traceback leaves out the analyzer's own frames, so it reads like Python's. Pyodide's own modules may still import each other, so its event loop works as before. The error Fact gains `blocked`, and the note under Run says the module is blocked here, even for a Program from a Share link.
- The block doesn't make Python a sandbox: a Program can still reach those modules another way, such as through `sys.modules`. What keeps it from reaching other sites is the policy.
