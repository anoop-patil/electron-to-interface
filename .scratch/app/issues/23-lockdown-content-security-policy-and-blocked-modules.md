# 23: Lockdown: Content Security Policy and blocked modules

**What to build:** Code a learner runs, including code arriving through a Share link, can't use their browser to reach other sites.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser; 22: Deploy to Cloudflare Pages, with Web Analytics

**Status:** ready-for-agent

- [ ] A Content Security Policy on the page and the worker allows connections only to our own domain. It's verified on the deployed site and in a Playwright test.
- [ ] `js`, `pyodide` and `micropip` are blocked in the Python that runs user code, so `import js` fails with a friendly message.
