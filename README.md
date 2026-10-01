# ElectronToInterface

Write a short Python program, click Run, and zoom in: from your code to its bytes, tokens, syntax tree and bytecode, then the interpreter's C code, the CPU instructions, the operating system and the pixels on your screen. Each zoom level explains what it shows in plain English, and says how it knows. Programs can be up to 20 lines and use any Python feature. Think *Powers of Ten*, for programming.

## What works today

- **The app** (`app/`) shows your program at zoom levels 1 to 4. You type a program and click Run, and Python 3.14.2, running in your browser, shows your code, its bytes, its tokens and its structure. Click a byte to see which character it stores, why, and its 8 bits. Click a token to see what kind it is, where it sits and which bytes make it up; the tokens include the ones that mark line ends and indentation. Level 4 shows the syntax tree Python builds from your code, as boxes inside boxes; click a box to see its role. On phones the tree is an indented outline. The text on every level comes from Templates filled in with your program's Facts, so it fits any program.
- Each zoom level says how it knows what it shows, with an Honesty label such as Observed. Highlighted words open short Concept cards inside the app, and the Concepts button in the header lists them all.
- When you click Run, your program runs. The Terminal, under the editor, shows what it printed, and the traceback if it stopped with an error. While it runs, Python records each line, call, return and error (Events) and every bytecode step that ran, in order (step runs), with the line of output each step printed. No zoom level shows these yet; level 5 will. A long run keeps the first 2,000 of each, and the Terminal says so. A program that never ends, such as `while True: pass`, leaves Run waiting until ticket 20 adds a time limit.
- Under the Terminal, the Machine map shows your computer: disk, RAM, CPU, operating system and screen. It lights the part that holds what you're looking at: at levels 1 to 4, RAM, because the app keeps your program in memory and never saves it to your disk. Each part opens its Concept card. The map is labeled Typical: it shows how computers usually work, and yours may differ. On phones the map is folded away behind "Your computer: where is everything?".
- Each of levels 1 to 4 has a Try it yourself section: a command to run on your own computer, for your program saved as `program.py`, with tabs for what each part does, what it shows and how to read it. What it shows is real: when you click Run, Python in your browser does what the command does, on your program, so you see your program's own output, its bytes as a list of numbers, its tokens as `python -m tokenize` lists them, or its syntax tree as `python -m ast` prints it.
- You can move through all nine zoom levels with the depth gauge, the Zoom in and Back buttons, the ↓ and ↑ keys, or the address bar (`/zoom/1` to `/zoom/9`). Levels 5 to 9 aren't built yet and say so. The app has light and dark themes and works on phones. Tickets 01 to 09 and 32, of 32, are done.
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

- `app/analyzer/analyze.py` is the Python that turns a program into an Analysis: the Facts that the zoom levels show. It saves the program as `program.py` in Python's in-memory files and runs it once as `python program.py` would, recording its output, Events and step runs with `sys.monitoring`. Then it runs each Try it yourself command on the same file (`python FILE`, `python -c` or `python -m`), recording what the command printed. It lists the program's tokens with `tokenize` and its syntax tree with `ast`. It runs in Pyodide (CPython compiled to WebAssembly) inside a Web Worker. Your code is analyzed in your browser and never sent anywhere, and the site serves Pyodide's files itself rather than from another site.
- `app/schema/analysis.schema.json` defines the Analysis and the Template format. The TypeScript types in `app/src/generated/` are generated from it: after editing the schema, run `npm run gen:types`.
- `app/templates/py314.json` holds the Templates for Python 3.14: the text of each explanation, with slots such as `{value}` for Facts. It also holds each zoom level's Try it yourself command and its text. `app/src/explain/` fills them in.
- `app/concepts/cards.json` holds the Concept cards and the Concepts index. `app/concepts/honesty-labels.json` holds the set of Honesty labels and which one each zoom level and panel carries, so changing the set is a data edit.
- The build fails if a Template, a card or the labels break the schema, if a Template names a Fact that doesn't exist, or if any text opens a card that doesn't exist.
- `app/src/` is the React page. `app/src/zoom/` holds the zoom levels, the depth gauge and the navigation between levels. `app/src/terminal/` holds the Terminal. `app/src/machine/` holds the Machine map: `mapState.ts` says what each zoom level lights, so a new level adds an entry there and leaves the map alone.
- Components are styled with Tailwind classes. `app/src/styles.css` holds the design tokens, CSS variables with a light and a dark value each, and Tailwind's theme reads its colors and fonts from them.
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
