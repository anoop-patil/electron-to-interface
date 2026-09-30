# ElectronToInterface

Write a short Python program, click Run, and zoom in: from your code to its bytes, tokens, syntax tree and bytecode, then the interpreter's C code, the CPU instructions, the operating system and the pixels on your screen. Each zoom level explains what it shows in plain English, and says how it knows. Programs can be up to 20 lines and use any Python feature. Think *Powers of Ten*, for programming.

## What works today

- **The app** (`app/`) shows your program at zoom levels 1 and 2. You type a program and click Run, and Python 3.14.2, running in your browser, shows your code and its bytes. Click a byte to see which character it stores.
- You can move through all nine zoom levels with the depth gauge, the Zoom in and Back buttons, the ↓ and ↑ keys, or the address bar (`/zoom/1` to `/zoom/9`). Levels 3 to 9 aren't built yet and say so. The app has light and dark themes and works on phones. Tickets 01 and 02 of 32 are done.
- **The prototype** (`prototype/hello-zoom-v8.html`) shows all nine zoom levels for one 5-line Example, `prototype/examples/greet.py`. Open the file in a browser. `hello-zoom-v7.html` is the earlier hello-world version.

## Run the app

You need Node.js 24 and Python 3.14.

```
cd app
npm install
npm run dev
```

Open the address it prints. Run turns on once Python has loaded, which takes a few seconds.

To run the tests (GitHub Actions runs all of them on every push):

```
cd app
npm run typecheck
npm test                          # Vitest: the analyzer running in real Pyodide
npx playwright install chromium   # once
npm run test:e2e                  # Playwright: the page in a real browser
pip install -r requirements-dev.txt
python -m pytest                  # pytest: the analyzer on CPython
```

## How the app is built

- `app/analyzer/analyze.py` is the Python that turns a program into an Analysis: the Facts that the zoom levels show. It runs in Pyodide (CPython compiled to WebAssembly) inside a Web Worker. Your code is analyzed in your browser and never sent anywhere, and the site serves Pyodide's files itself rather than from another site.
- `app/schema/analysis.schema.json` defines the Analysis. The TypeScript types in `app/src/generated/` are generated from it: after editing the schema, run `npm run gen:types`.
- `app/src/` is the React page. `app/src/zoom/` holds the zoom levels, the depth gauge and the navigation between levels.
- The site serves its fonts, IBM Plex Sans and Mono, itself.

## The plan

- `Requirements.md`: what the finished tool does and how it is built.
- `CONTEXT.md`: the glossary. `docs/adr/`: the design decisions and why they were made.
- `.scratch/app/issues/`: the 32 tickets. Most are numbered in the order they can be built; ticket 32 (Tailwind) was added later. Each one lists the tickets that block it.

## Where the prototype's facts come from

Everything the prototype labels Observed or Reference was captured on Linux x86-64 with CPython 3.14.2 (python-build-standalone release 20251205). The scripts in `prototype/tools/` reproduce it:

- `extract-machine-code.sh` disassembles the interpreter's handlers for each hello-world step.
- `trace-handler-paths.sh` records, with gdb, which of those instructions actually run.
- `capture-example.sh greet` captures everything v8 shows for an Example: bytes, tokens, syntax tree, bytecode, the order the steps ran in, which handler ran on each run of each step (gdb, 3 identical runs), and those handlers' machine code.
- `build-hello-zoom-v8.py` builds `hello-zoom-v8.html` from its template and that data.
- `check-c-refs.mjs` confirms that every quoted line of CPython C source sits at the line number shown.

The shell scripts run on Linux or WSL. They download what they need into `/tmp` and install nothing.

## License

- **Code:** MIT, see `LICENSE`.
- **Written content** (explanations, Concept cards, Templates and the documents in this repository): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). You can reuse it, for example in a classroom, with credit to ElectronToInterface.
- **Fonts:** IBM Plex Sans and Mono, under the SIL Open Font License; see `licenses/IBM-Plex-LICENSE.txt`.
- **CPython material:** the prototype quotes CPython's C source, and `prototype/data/` holds machine code disassembled from the CPython 3.14.2 binary. That material is copyright the Python Software Foundation and is used under the PSF License; see `licenses/CPython-LICENSE.txt`.
