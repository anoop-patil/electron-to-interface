# 01: Walking skeleton: your program's bytes, in the browser

**What to build:** A learner types a short program into the page, clicks Run, and sees it at zoom level 1 and its bytes at zoom level 2, produced by real Python 3.14.2 running inside their own browser. This is the thinnest path through every layer: engine, Analysis, schema, UI, tests and CI. A plain text box is enough here; the full editor comes in ticket 19. Design reference for every UI ticket: prototype v8 (`hello-zoom-v8`, built by `prototype/tools/build-hello-zoom-v8.py`). Prototype v7 (`hello-zoom-v7`) keeps hello world's line-by-line notes for level 7.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] The project is a git repository with an MIT license for code and a note that written content is CC BY 4.0 (Requirements: Technology). Done: github.com/anoop-patil/electron-to-interface, commits as anoop-patil with the account's noreply address.
- [x] A React + TypeScript + Vite single-page app.
- [x] Pyodide 314.0.x (Python 3.14.2) runs in a Web Worker and is served from our own origin, never a third-party CDN (ADR 0004).
- [x] A text box for the Program and a Run button. Nothing is analyzed while the learner types; Run sends the Program to the worker. Until Pyodide is ready, Run is off, with a short note saying why.
- [x] The worker exposes `analyze(code)`, which returns an Analysis with `pythonVersion` and `bytes`. Each byte is a Fact with a stable Fact ID (`byte-0`, `byte-1`, ...).
- [x] The Program is treated as a file that ends with a newline, as code editors save it, whether or not the learner pressed Enter after the last line.
- [x] A single JSON Schema defines the Analysis. TypeScript types are generated from it, and a test validates the Python output against it.
- [x] The UI shows zoom level 1 (the whole Program, every line) and zoom level 2 (a hex grid of bytes, each linked to its character), and displays "Python 3.14.2" from the Analysis, not hardcoded.
- [x] Vitest, pytest and Playwright each have at least one passing test, and GitHub Actions runs all three on every push.
- [x] A Playwright test types hello world, clicks Run, and confirms 22 bytes: the first is `p` = 112 (0x70) and the last is the newline, 10 (0x0A).
- [x] A Playwright test types a Program of several lines, clicks Run, and confirms every line ends in a newline byte in the grid.

## Comments

Built in `app/`. Decisions made along the way:

- Pyodide is pinned to 314.0.7, the newest 314.0.x; its `pyodide-lock.json` says Python 3.14.2. `app/vite.config.ts` copies its runtime files into the build, so the site serves them itself. A Playwright test fails if the page requests anything from another origin.
- Besides `pythonVersion` and `bytes`, the Analysis carries `program`: the Program as analyzed, ending with its newline. Each byte records `charIndex` (its character, counted in code points, so the bytes of é share one) and `line`.
- The schema is validated twice: pytest checks the analyzer under CPython (3.14.2 in CI), and Vitest checks the output of the real Pyodide in Node, which is the Python the browser runs. A Vitest test fails if `src/generated/analysis.ts` is out of date with the schema.
- An empty Program is analyzed as a single newline.
- Styling is plain CSS with prototype v8's colours. Ticket 02 added self-hosted IBM Plex; Tailwind comes in ticket 32.
