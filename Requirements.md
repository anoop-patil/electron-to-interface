# ElectronToInterface — Requirements

Sep 30, 2026 · @Anoop · Terms follow [CONTEXT.md](CONTEXT.md); decisions are recorded in [docs/adr/](docs/adr/).

## Vision

ElectronToInterface lets anyone write a short program of their own, up to 20 lines, and keep zooming in until they reach the bytes and CPU instructions that make it run. Starting from anything as simple as `print("Hello World!")`, a learner steps down through characters and bytes, tokens, the syntax tree, bytecode, the interpreter that executes it, the machine instructions, the operating system and finally the pixels on the screen, with every layer explained in plain, friendly language. Nothing is guessed: each zoom level shows what actually happened to the learner's own code, and says honestly when it is showing prepared or typical behavior instead. It is a *Powers of Ten* for programming, starting with Python and growing to other languages.

**Audience:** self-learners first (arriving from Hacker News, Reddit, YouTube; traffic is spiky and may go viral). It must also work for classrooms, where many students share one school IP address.

**Funding:** free, no revenue. Donations may be added later.

## Core design principles

These rules are non-negotiable and override any other requirement they conflict with.

1. **Hard budget ceiling of $500/month, enforced by construction.** Only services that cannot bill past a limit are allowed: free tiers with a hard stop, fixed-price services, or prepaid credit with auto-reload off. Budget *alerts* are not a control. ([ADR 0001](docs/adr/0001-hard-budget-ceiling-by-construction.md))
2. **Nothing a user does calls a server we pay for.** v1 is a static site. Per-user cost is zero at any traffic level, and there is no endpoint to abuse. ([ADR 0002](docs/adr/0002-no-runtime-backend-in-v1.md))
3. **Learner code never leaves the browser.** No request contains the learner's program, its Facts or its runtime values. ([ADR 0004](docs/adr/0004-learner-code-never-leaves-the-browser.md))
4. **The tracer decides the Facts; AI only helps write the explanations, at build time.** Every Fact comes from real Python instrumentation. Claude helps author Templates offline and never decides what happened.
5. **Every zoom level is honest about how it knows.** Each level, and any panel whose provenance differs from its level, carries exactly one Honesty label: *Observed* (Python recorded it from the learner's code), *Derived* (worked out from observed facts using Python's rules), *Reference* (real, prepared in advance, such as CPython source or test-machine measurements), *Illustrative* (a made-up example, not real data; prototype only) or *Typical* (how it usually works). ([ADR 0005](docs/adr/0005-five-honesty-labels.md))

## The learner's program

The site is built around the learner's own code. Hello world and the other Examples are starting points, not the product. ([ADR 0006](docs/adr/0006-v1-programs-up-to-20-lines-typed-then-run.md))

- **Up to 20 lines, any Python feature.** Anything valid in Python 3.14.2 is allowed: loops, functions, classes, comprehensions, `try`/`except`, f-strings, standard-library imports and so on. The only limits: the standard library only (no third-party packages), nothing a browser can't do (threads, subprocesses, network access), and `input()` returns an empty string.
- **Type, then Run.** The learner types (or uploads) their program, then clicks **Run** when they're done. Only then is it analyzed and run, and the zoom view opens on it. Nothing is analyzed while they type. Editing after a Run marks the zoom view as out of date until they Run again.

## Zoom levels

Nine zoom levels, from the learner's program down to pixels. Example throughout: `greet.py`, the 5-line Example in prototype v8: a function `greet(name)` that prints a greeting, called in a loop over `["Ada", "Grace"]`.

| # | Zoom level | What the learner sees | Source | Honesty label |
| --- | --- | --- | --- | --- |
| 1 | Your code | The program as written | Editor | Observed |
| 2 | Bytes | The file as bytes, line by line: 94 bytes, each line ending in newline `0x0A`, indentation stored as spaces (`0x20`) | UTF-8 encoding of the source | Observed |
| 3 | Tokens | Each line's tokens, including INDENT and DEDENT where an indented block starts and ends, and NL for the empty line | `tokenize` | Observed |
| 4 | Syntax tree | Module → FunctionDef `greet` and For, each with its own body | `ast` | Observed |
| 5 | Bytecode | Each code object's steps (18 for the file, 8 for `greet`), how many times each ran, and every step run in order (42) | `dis`, `sys.monitoring` | Observed (plates: Derived) |
| 6 | Interpreter C code | The CPython C source for the selected step run; on a run where the step rewrites itself, the general form's lines, then the new form's | Reference Library | Reference |
| 7 | CPU instructions | The machine code of each handler that ran for the selected step run, with their bytes and the path that ran | Reference Library | Reference |
| 8 | Operating system | Each printed line is one system call: 11 bytes for `Hello, Ada`, 13 for `Hello, Grace` | Hand-written | Typical |
| 9 | Pixels | The terminal maps characters to a font and lights pixels | Hand-written, plus a pixel grid rendered live by the browser | Typical |

The key teaching moment is the **Interpreter handoff** between levels 5 and 6: **by default, CPython never compiles your code to CPU instructions.** (Python 3.13+ ships an experimental JIT that can, but it is off unless enabled; the UI must say "by default".) Below bytecode, the zoom switches from "your code, translated further" to "the interpreter program that reads your code." The UI must make this handoff explicit.

Bytecode differs between Python versions, so it is never hardcoded, and the Python version is always shown. In the browser the real bottom layer is WebAssembly, not native CPU instructions, so levels 6–7 always come from the Reference Library.

**What the learner selects decides what the deeper levels show** ([ADR 0007](docs/adr/0007-selection-decides-what-the-deeper-levels-show.md)). Levels 1–5 show the whole program. At level 5 the learner selects a step and one of its runs: a step inside a loop or a function has several. Levels 6 and 7 show what the interpreter did for that step run, and levels 8 and 9 follow the line of output it printed, with a way to pick any other line. Every step run is its own view, because runs differ: the plates differ, and a busy step rewrites itself into a faster form, so its second run can run a different handler.

**Pinned version:** Python **3.14.2**, via Pyodide **314.0.7**, the newest release in the 314.0 line, which ships 3.14.2. The Reference Library is built from the same exact patch release. The pinned version is upgraded about once a year, on purpose, never automatically.

## Architecture

Everything the learner sees is served as static files. There is no runtime backend.

```
BUILD TIME (GitHub Actions)                        RUNTIME (learner's browser)
───────────────────────────                        ───────────────────────────
Template generator (Python + Claude Batch API) ─┐
Reference Library builder (Python + Clang)     ─┼─► static JSON ─► Cloudflare Pages ─► React app
Example Analyses (analyzer run ahead of time)  ─┘                                      │
                                                                                       ▼
                                                                  Pyodide in a Web Worker
                                                                  (analyzes the learner's code)
```

- The analyzer is Python code running inside Pyodide. It produces an **Analysis** (the set of **Facts**) for the learner's program.
- The UI reads the Analysis, fills **Templates** with Fact values to make **Explanations**, and looks up levels 6–7 in the **Reference Library**.
- A single **JSON Schema** is the source of truth for the Analysis, Template and Reference Library formats. TypeScript types are generated from it; Python output and all build data are validated against it.

### Technology

| Area | Choice | Why |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite, as a single-page app | Best-known stack. The zoom view is a self-contained component, so indexable Astro pages per opcode can be added later. |
| Styling | Tailwind, reading design tokens from CSS variables | One swap of variables switches between light and dark |
| Components | The browser's own `<dialog>` for Concept cards and `<details>` for Try it yourself, whose tabs are built by hand on the ARIA tabs pattern. shadcn/ui (on Radix) for other pieces when they are needed: tooltip, popover, toggle | `<dialog>` and `<details>` work with no dependency, and three tabs need about 30 lines. shadcn/ui is accessible, and its code lives in our repo, styled with our design tokens |
| Fonts | IBM Plex Sans + IBM Plex Mono, self-hosted WOFF2, trimmed to needed characters, two weights each | Sans and mono designed as one family; no third-party font requests (ADR 0004) |
| Editor | CodeMirror 6 | Lighter than Monaco and works on mobile |
| State | Zustand | — |
| Browser engine | Pyodide 314.0.7 (Python 3.14.2) in a Web Worker, **served from our own domain** | No third-party CDN, works on school networks, keeps ADR 0004 true |
| Data contract | JSON Schema, with generated TypeScript types | Keeps the Python and TypeScript sides in sync |
| Build tooling | Python scripts (the analyzer, Template generator, Reference Library builder) | They need the exact `dis` and `ast` of the pinned version |
| CI/CD | GitHub Actions, **public repo** | Free, unlimited minutes |
| Hosting | Cloudflare Pages | Free, unlimited static traffic with no bandwidth fees (Pyodide is about 10 MB per first visit) |
| Analytics | Cloudflare Web Analytics | Free and cookieless; counts page paths only |
| Error monitoring | Sentry free tier, with scrubbing | Drops events past its quota rather than billing |
| Tests | Vitest, Playwright, pytest | — |
| License | **MIT** for code; **CC BY 4.0** for Templates and other written content; CPython excerpts in the Reference Library keep the **PSF License** notice | Simplest and most familiar license for code. Teachers can reuse the explanations with attribution. The PSF License requires its notice to ship with CPython source. |

## User interface

Elegant, pleasing and very simple: the calm of a well-set book with the precision of a measuring instrument. The learner's code and Facts are the most colorful things on screen; everything else is quiet.

**Look**

- Warm-gray neutrals, **one accent color** (selection, links, focus) and a separate muted set of colors for token and syntax categories.
- Light and dark themes, each designed properly (dark is not inverted light). The app follows the system setting, with a manual toggle.
- IBM Plex Sans for prose, IBM Plex Mono for code and every Fact. Explanations use a reading width of about 65 characters and generous line height.
- All text meets WCAG AA contrast in both themes. Everything can be operated from the keyboard, with visible focus rings.
- No gradient washes, glowing effects, mascots or emoji.

**Depth**

- A **depth gauge** (a thin ruler with 9 ticks; the current zoom level is lit) shows how deep the learner is and doubles as navigation. On mobile it becomes a horizontal strip at the top.
- A very subtle tint shifts from warm (your code) to cool (the machine) as the learner goes deeper.
- The **Interpreter handoff** is a visible break in the gauge between levels 5 and 6, labeled so the learner sees where their code ends and the interpreter begins.
- No breadcrumbs: the depth gauge already shows the path. Navigation is the gauge, the Zoom in / Back buttons and the arrow keys.

**Honesty labels are words, not border styles.** Each label is a small text chip (Observed, Derived, Reference, Illustrative, Typical); only Illustrative gets a warning color. Frames and panels don't encode labels with border styles, which learners couldn't tell apart at a glance. Every chip opens the "How we know" Concept card. Narrative text carries its own qualifiers too ("On a typical Linux terminal…"), so the chip isn't the only place a caveat appears.

**Layout and motion**

- Desktop: editor on the left, zoom view on the right. The editor narrows once zooming starts, but the code stays visible because highlights link back to it.
- Mobile: code on top (collapsible to one line), zoom view below.
- The **Machine map** sits under the editor and lights where the thing being viewed lives right now. Each part opens its Concept card. It is labeled *Typical*: it shows how computers usually work. On mobile it is collapsed behind "Your computer: where is everything?".
- **The only animation is the zoom:** the clicked element grows and fades into the next level in about 250 ms. With the system's reduced-motion setting on, it's a plain crossfade.

**One signature visual per zoom level**, always in the same position, with the Explanation beneath it:

| # | Signature visual |
| --- | --- |
| 1 | The program, line by line |
| 2 | A grid of bytes, one row per line, each byte linked to its character |
| 3 | Token chips, one row per line |
| 4 | Nested boxes: the function's and the loop's bodies inside their own boxes (an indented outline on mobile) |
| 5 | Each code object's steps with how often they ran, a strip of every step run in order, and the plates of every frame after the selected run |
| 6 | The C code for the selected step run, each line paired with a plain sentence |
| 7 | The machine code that ran: key lines in the order they ran, the full listing on demand |
| 8 | A small diagram: program → system call → kernel → terminal, for the selected line of output |
| 9 | A pixel grid: a real glyph rendered by the browser and enlarged until each pixel is a square |

## Phase 1: Browser engine and zoom UI

Phase 1 ships zoom levels 1–5 fully Observed, levels 6–9 as hand-written explanations labeled *Typical* (until the Reference Library lands in Phase 3), and deploys as a static site.

**Engine (Pyodide in a Web Worker)**

- Pin Pyodide 314.0.7, self-hosted; show its Python version in the UI.
- Expose `analyze(code)` returning an Analysis: `pythonVersion`, `program` (the Program as analyzed, ending with a newline), `fileName` (the name the Try it yourself commands use), `commands` (what each Try it yourself command printed when run on the Program), `bytes`, `encoding` (the encoding `tokenize` read the bytes with), `tokens`, `ast`, `bytecode` (every code object), `runs`, `events`, `frames`, `objects`, `stdout`, `stderr`, `error`.
- Every Fact has a stable Fact ID (`byte-0`, `tok-0`, `ast-0`, `bc-0`, `run-0`, `ev-0`, `frame-0`, `obj-0`, numbered from 0) that Explanations and highlights point at.
- Events (line, call, return, exception) are recorded with the `sys.monitoring` events that `sys.settrace` is built on, in the same run as the step runs, with a safe, truncated repr of locals. With `sys.settrace` on, Python reports no INSTRUCTION events.
- Step runs, the order the bytecode steps ran in, are recorded with `sys.monitoring` INSTRUCTION events. It doesn't report RESUME, so RESUME's runs are added where each code object starts. Each line of output is tied to the step run that printed it.
- Record, after the run, which **specialized** form each step had become (`dis` with `adaptive=True`; e.g. `BINARY_OP_ADD_INT`), so Phase 3 can match it in the Reference Library. While `sys.monitoring` reports every step, Python rewrites none, so the forms come from a second run of the Program, unwatched: the `python program.py` command of level 1's Try it yourself.
- Replay each frame's plates (its stack) and variables from the step runs with Python's rules: how many plates each step takes and puts back, from CPython 3.14.2's own opcode metadata. A plate points to an object where the replay can tell which, without running any of the learner's code. Derived.
- Cap Events and step runs at 2,000 each, and tell the learner when a record is cut short.

**Zoom UI**

- Left: code editor (CodeMirror 6) with file upload, a **Run** button and the Examples: hello world, a for loop, a function call, a list comprehension, a class, a syntax error.
- Right: the zoom view. Clicking an element (a token, a box, a bytecode step, one run of a step) selects it and explains it; moving to the next level is always an explicit **Zoom in** button (or ↓), never a second click on the element, which is hard to discover and easy to trigger by accident. Each level opens with a sentence explaining why the next layer has to exist.
- **Each zoom level has its own URL path** (e.g. `/zoom/7`), so back buttons and deep links work and analytics can count zoom depth.
- Each zoom level shows its Explanation, its Honesty label and a **Try it yourself** section, collapsed by default to one row showing the command: a real command, written for the learner's own file, that shows the same Facts on their own computer. Tabs explain what each part of the command does, what it shows, and how to read every number in it. What it shows is observed in the learner's browser wherever the browser can observe it:
  - **Levels 1–5:** the command's exact output for the learner's own program, generated live by the in-browser Python. It is the pinned version, so the output matches what they'd see at home. Observed.
  - **Level 6:** which faster form each step had become after the run (`dis` with `adaptive=True`), which says which C code runs from the second time on. Observed.
  - **Level 7:** how long the program took and how many steps ran, measured in the learner's browser just now. Observed, with a note that the browser runs Python on WebAssembly rather than directly on their CPU, so a normal Python's time differs.
  - **Level 8:** the exact bytes `print` handed to `sys.stdout`, piece by piece and line by line. Observed. The system call itself can't happen in a browser, so it stays Typical.
  - **Level 9:** the pixel grid above is already drawn live; Try it yourself shows how to see real subpixels on a screen.
  Commands a browser can't run for the learner (native timing, `strace`) come with a sample output captured on one Linux x86-64 machine with the pinned CPython, labeled as the Example's, with the platform stated. For the Examples, every output is captured that way in advance.
- A build-time check confirms that every quoted line of CPython C source appears at the linked line of `Python/bytecodes.c` at the pinned tag, using a copy of that file kept in the repo with its SHA-256; the build fails otherwise. It started as the prototype's `prototype/tools/check-c-refs.mjs`.
- Words with a Concept card are highlighted, and open a self-contained explanation inside the app; nothing links out for explanations.
- Selecting anything highlights the related source line and related Facts at every other zoom level, via Fact IDs. At level 5, Next and Back follow the order the steps ran in, moving between code objects, and the selected step run decides what levels 6–9 show ([ADR 0007](docs/adr/0007-selection-decides-what-the-deeper-levels-show.md)).
- Dark and light mode; usable on mobile.

**First visit**

- The Analysis of every Example is computed at build time and shipped as static data, so hello world zooms instantly while Pyodide loads in the background.
- The editor works straight away, so the learner can type while Pyodide loads. Run works once Pyodide is ready, with a friendly loading indicator until then.
- Browsers that cannot run Pyodide (e.g. low-memory phones) still get every Example, plus a note.
- Supported browsers: the last two versions of Chrome, Firefox, Safari and Edge; iOS Safari 17+.

**Share links**

- A Share link carries the program compressed in the URL fragment (`#…`). No server or storage; the fragment is never sent to a server.
- A Share link opens with the code visible and a **Run** button; it never runs automatically. Examples do run automatically.

**Robustness**

- 5-second execution timeout, enforced by terminating and recreating the worker.
- `input()` returns an empty string, with a visible note.
- Syntax errors: show levels 1–3 as far as they get, then explain the error in plain English.
- Limits: 20 lines and the standard library only; any Python feature is allowed (see The learner's program).

## Phase 2: Templates written with AI at build time

Phase 2 replaces generic explanations with rich, reviewed Templates for every element, written with Claude **offline** and shipped as static files. No user action ever calls Claude.

**What is generated**

- A Template for every token type, AST node type and bytecode opname (including specialized variants) in the pinned version, in **one voice**: plain English first, with the technical term introduced once in small print (e.g. "Find the name print · `LOAD_NAME`"). There is no audience toggle.
- "Why?" and "Go deeper" text per element type.
- "Tell it as a story": one narrative across all zoom levels, **for the Examples only**. The learner's own Program gets a story stitched together from Templates.
- Templates have slots filled with real Fact values. Example: `LOAD_NAME print` → "Python looks up the name **print**. It checks your variables first, then its built-in toolbox, where it finds the print function."
- Templates live in versioned data files (e.g. `templates/py314.json`).

**How it is generated**

- A Python script calls the Claude **Batch API** (50% cheaper than standard calls), using the most capable Claude model at generation time. Quality matters more than price for a one-off run.
- Every output is validated against the JSON Schema; any reference to a Fact that doesn't exist fails the build.
- Generation runs only on manual trigger or when inputs change, never on pull requests from forks. Outputs are committed to the repo, so a normal deploy never calls Claude.
- The Anthropic API key lives only in GitHub Actions secrets and uses **prepaid credit with auto-reload off**.

**Review**

- A human reviews every Template used by the Examples and the ~30 most common opcodes and node types; the rest are spot-checked.
- The About page says: "Explanations written with AI assistance, reviewed by humans." This is not a per-level label, because Honesty labels describe where the *data* came from.

**Fallbacks**

- Unknown opnames or node types fall back to a generic Explanation plus a link to the official docs; the app never crashes on unfamiliar code.
- CI fails if any opname, node type or token type in the pinned version has no Template.

## Phase 3: Reference Library (zoom levels 6–7)

Phase 3 makes zoom levels 6 and 7 real, using data prepared at build time. ([ADR 0003](docs/adr/0003-reference-library-uses-tail-calling-interpreter.md))

- Build CPython **3.14.2** with **Clang 19+, `--with-tail-call-interp`, PGO and LTO**, for **x86-64** first; ARM64 later. In this build each opcode is its own C function, so its machine code is clean to show.
- For each bytecode instruction **and each specialized variant** (e.g. `BINARY_OP_ADD_INT` vs `BINARY_OP_ADD_UNICODE`), record the C source of its handler and its compiled machine instructions, by tracing small programs that exercise each variant.
- Stored as static JSON served with the frontend, and validated against the schema.
- Prototype v6 already does this for `print("Hello World!")`, using python-build-standalone's CPython 3.14.2 build (see ADR 0003): `prototype/tools/extract-machine-code.sh` downloads that exact binary, checks its sha256, and writes each handler's instructions, bytes and called functions to `prototype/data/`. Prototype v7 adds which of those instructions actually ran: `prototype/tools/trace-handler-paths.sh` single-steps each of the 8 handlers with gdb (downloaded, not installed), 3 times, fails unless all 3 runs match, and writes the path to `prototype/data/handler-paths-cpython-3.14.2-linux-x86_64.json`. Level 7 highlights that path, labeled *Reference*, and explains `LOAD_NAME`, `CALL` and `RETURN_VALUE` line by line. Prototype v8 does the same for a 5-line Example with a function and a loop (`prototype/tools/capture-example.sh`). It records every run of every step, which shows that the second trip round the loop runs different handlers: `CALL` rewrites itself into `CALL_PY_EXACT_ARGS`, and `LOAD_GLOBAL` into `LOAD_GLOBAL_BUILTIN`. It also shows that the build copied `RESUME_CHECK`'s code onto the end of `CALL_PY_EXACT_ARGS`, so on the second call to the function no `RESUME` handler of its own runs.
- Record each handler's `.warm` and `.cold` parts too: BOLT moves code there, and for some handlers most of the work runs there (in prototype v8, 102 of the 107 instructions `CALL_PY_EXACT_ARGS` ran).
- The build can copy one handler's code into another. When a step's work ran inside another handler, the page says so and points to it.
- If there's no exact match for what ran, show the closest variant, still labeled *Reference*, with a note saying it is the closest match.
- A path through the machine code is recorded on a small test program, not on the learner's own run, and the page says so.
- The nerdy-details panel states the compiler, flags and CPU architecture.
- **Coverage corpus:** a set of real beginner programs is analyzed in CI, and the report shows what share of level-7 zooms find an exact match.

## Parked (not in v1)

These are deliberately out of v1 and reopened only under the conditions below. Any version of them must satisfy principle 1.

| Feature | Reopen when | Stack if reopened |
| --- | --- | --- |
| Live AI explanations of the learner's own code | Clear demand for "explain *my* code" beyond what Templates give | Cloudflare Worker on the **free** plan (hard stop at its daily quota) plus prepaid Anthropic credit, auto-reload off. Would need a change to principle 3. |
| Live native tracing on a server | More than 10% of sessions reach zoom level 7 **and** more than 20% of level-7 zooms in the Coverage corpus have no exact match | FastAPI on a **fixed-price** VPS, nsjail or gVisor sandbox, and a bounded queue that returns "busy" when full |

For scale: live Haiku 4.5 explanations at 3M requests/month would cost about $2,500/month even as an opt-in feature with caching, five times the ceiling. That's why AI moved to build time.

## Security and abuse prevention

With no runtime backend there's no server to attack and no metered endpoint to abuse. The remaining risk is code running in the learner's own browser, especially code arriving through a Share link.

- **Content Security Policy** on the page and the worker: connections only to our own domain. Python cannot use the learner's browser to reach other sites.
- **Blocked modules** in the Python that runs user code: `js`, `pyodide`, `micropip`.
- **Share links require a Run click** before any code runs.
- **5-second timeout**, enforced by killing the worker.
- **Error reports are scrubbed** (ADR 0004). An automated test fails if a marker string from the editor appears in an outgoing report.
- **Build secrets:** the Anthropic key exists only in GitHub Actions secrets, is never exposed to fork pull requests, and is backed by prepaid credit only.

## Hosting and cost

v1 costs about **$0/month to run, plus a domain**, at any traffic level. The $500 ceiling is headroom for anything reopened from the Parked list.

| Item | Service | Cost | Hard stop? |
| --- | --- | --- | --- |
| Frontend, Pyodide, Templates, Reference Library, Example Analyses | Cloudflare Pages (free) | $0 | Free for unlimited static traffic, no bandwidth fees |
| Analytics | Cloudflare Web Analytics | $0 | Free |
| Error monitoring | Sentry (free tier) | $0 | Drops events past the quota |
| CI and builds | GitHub Actions (public repo) | $0 | Free for public repos |
| Template generation | Anthropic API, Batch API | One-off, per generation run | Prepaid credit, auto-reload off |
| Domain | Registrar | ~$10–15/year | Fixed |

**Cost rules (required)**

- No pay-as-you-go service without a hard stop, ever (ADR 0001).
- The fixed monthly prices of all services combined stay under $500.
- When anything metered hits its limit, it switches off and the app falls back to what's free. It never buys more capacity.

## Milestones and acceptance criteria

Each milestone ships on its own; the next one starts only when every box above it is ticked.

**M1: Real Facts in the browser**

- [x] A learner types a multi-line program and clicks Run; the worker returns its bytes, tokens, AST, bytecode, Events and stdout, rendered raw.
- [ ] Python 3.14.2 is displayed; Pyodide is served from our own domain.
- [ ] The Analysis validates against the JSON Schema.

**M2: Phase 1 complete**

- [ ] `print("Hello World!")` shows all nine zoom levels, with correct Honesty labels, and so does a 20-line program the learner types.
- [ ] At level 5, Next follows the order the steps ran in, and selecting any run of any step decides what levels 6–9 show.
- [ ] All Examples work, including the syntax error, and load instantly from their build-time Analyses before Pyodide is ready.
- [ ] `while True: pass` times out cleanly without freezing the page.
- [ ] Unknown opcodes and AST nodes fall back gracefully.
- [ ] Clicking any element highlights related Facts across zoom levels.
- [x] Each zoom level has its own URL path.
- [ ] Share links round-trip a 20-line program and require a Run click.
- [ ] The CSP blocks connections to other domains from the page and the worker; `import js` fails in user code.
- [ ] The error-report scrubbing test passes.
- [ ] Deploys to Cloudflare Pages with no backend.

**M3: Templates (Phase 2)**

- [ ] Every opname (including specialized variants), AST node type and token type in 3.14.2 has a Template; CI enforces this.
- [ ] Every generated Template validates against the schema; any reference to a missing Fact fails the build.
- [ ] Templates for the Examples and the top ~30 elements are human-reviewed.
- [ ] Every Example has a story.
- [ ] The Anthropic key is only in CI secrets, on prepaid credit with auto-reload off.

**M4: Reference Library (Phase 3)**

- [ ] CPython 3.14.2 is built with Clang 19+, tail-calling interpreter, PGO and LTO; the flags are recorded.
- [ ] Every opcode and specialized variant has C source and x86-64 instructions.
- [ ] Zooming into any step of a learner's Program reaches level 7, as an exact or closest match, with no network call beyond static files.
- [ ] CI publishes a coverage report for the Coverage corpus.

## Risks, open questions and out of scope

**Risks**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| AI-written Templates sound fluent but are wrong | Wrong teaching | Human review of core Templates, schema validation, Fact-ID checks |
| The tail-calling build isn't what most people run | Level 7 differs from a learner's own Python | Reference label; compiler and flags shown in the details panel (ADR 0003) |
| Pyodide trails CPython patch releases (3.14.2 vs 3.14.7) | Version mismatch with other sources | Build the Reference Library from Pyodide's exact version |
| Pyodide too heavy for some phones | Learners on those devices can't Run their own Program, the core of the site | Examples still work from build-time Analyses, with a note saying why Run is off |
| Malicious Share links | Visitors' browsers misused | CSP, blocked modules, Run click, timeout |
| Error monitoring leaks learner code | Breaks the privacy promise | Scrubbing plus an automated leak test (ADR 0004) |
| Bytecode changes each Python release | Templates and the Reference Library go stale | Versioned data files, deliberate yearly upgrades, CI completeness checks |

**Open questions**

- Domain name.
- When to add ARM64 to the Reference Library.
- Donation platform, if any.
- **Which form ran on each run, for the learner's own program.** For the Examples, gdb records at build time which handler ran on every step run. In the browser only the form each step had become after a second, unwatched run is known: the recorded run can't show any, because watching every step stops Python rewriting them. How levels 6–7 show earlier runs of the learner's own program is still open.

**Out of scope for v1**

- Languages other than Python (the Analysis format stays language-agnostic).
- Third-party packages and interactive `input()`.
- Programs over 20 lines.
- User accounts and any server-side storage.
- Live AI explanations and live native tracing (see Parked).
