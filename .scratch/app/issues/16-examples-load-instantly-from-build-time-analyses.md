# 16: Examples load instantly from build-time Analyses

**What to build:** A first-time visitor can zoom through hello world immediately, before Pyodide has finished loading, and can pick any of the shipped Examples.

**Blocked by:** 07: Your program runs: real output and Events

**Status:** ready-for-agent

- [x] Examples: hello world, a for loop, a function called in a loop (greet.py, from prototype v8), a list comprehension and a class. Apart from hello world, each is several lines long, within the 20-line limit. The syntax-error Example comes in its own ticket.
- [x] Each Example's Analysis is computed at build time with the same pinned Python, shipped as static data, and validated against the schema.
- [x] Hello world renders before Pyodide is ready, while Pyodide loads in the background. Examples run automatically.
- [x] The learner can type their own Program while Pyodide loads. A friendly loading indicator shows until Run works.
- [x] Browsers that can't run Pyodide (for example low-memory phones) still get every Example, plus a note.

## Comments

- Ticket 13: level 7's Try it yourself shows each Example's own native timing, captured on the test machine, and greet.py's for anything else. Only hello world and greet.py have one; a new Example gets greet.py's until the capture tools time it too.
- Ticket 14: level 8's Try it yourself does the same with strace's list of write calls (`samples` in the Reference Library, by zoom level). The build-time Analyses must carry `writes`, the pieces each Example handed to `sys.stdout` and `sys.stderr`, which level 8 follows.

Built in `app/`. Decisions made along the way:

- The user approved the Examples' code. They are in `app/examples/` (`hello.py`, `loop.py`, `comprehension.py`, `class.py`); greet.py stays in `prototype/examples/`. `src/examples/examples.ts` lists them in order, with each one's ID and button label. A test checks that each is within 20 lines, and that each Example in the Reference Library is shipped with the same code, so levels 6 and 7 still find hello world and greet.py.
- `src/examples/build.ts` is a Vite plugin. When the build or the dev server starts, it runs the analyzer in Pyodide 314.0.7 under Node.js, the Python the page runs, on each Example, as `program.py`, as a Run would. It checks each Analysis against the schema and writes it to `public/examples/<id>.json`, which git ignores. The build fails if one breaks the schema. Vitest skips the plugin: `build.test.ts` makes the Analyses itself and checks that each Example runs to the end and prints. The start-up code moved from `python.ts` to `engine/analyzer.ts`, so the plugin can load `analyze.py` without Vite's `?raw` import.
- The Analysis gains `example`, the Example's ID, set only on an Analysis made when the site was built. The user chose to say so wherever the page would claim the browser just did something, naming the Python as Pyodide, the Python this site runs, since a browser that can't run it gets the Examples too: level 1's introduction (`level1.introBuilt`), Try it yourself's output (`tryIt.built`), level 7's note on the time (`tryIt.level7.built`: the time was measured on the computer that built the site, so the note on the browser's coarse clock doesn't apply) and level 8's notes on the pieces (`level8.built`, `tryIt.level8.built`). Four Templates were reworded to be true either way: the traceback path and level 8's buffer path say "where Python saved it, among its in-memory files"; level 5's object sizes are "as this site's Python, compiled to WebAssembly, measures it"; and the traceback's colors drop "worked out in your browser". The Observed label's meaning now says "or, for an Example, when this site was built".
- The page starts with hello world's Analysis, fetched from `examples/hello.json`, unless the learner has already clicked Run or picked an Example. The user chose a row of buttons labeled Examples above the editor: hello world, for loop, function, list comprehension and class. Picking one puts its code in the editor and shows its Analysis at once, at the same zoom level, with nothing selected. Its button stays pressed until the code is edited. Only the latest Run or pick is shown.
- While Python loads, the note beside Run says "Python is loading in your browser. You can type, or try the Examples, while you wait; Run works once it’s ready."
- The user chose not to start Python where the browser has no WebAssembly, or reports under 1 GB of memory (`navigator.deviceMemory`, which only Chrome-based browsers report), since such a phone can close the tab rather than fail. `src/engine/support.ts` decides. Those browsers, and any where Python fails to start, get a note that Run is off and the Examples still work.
- Run is now off while a Run is in progress, and the zoom view is marked `aria-busy`. The e2e helper `run()` waits for it, since hello world is already on screen and a click could land on it before the Run's Analysis arrives. The e2e tests find the editor and Run by role, since level 5 has regions named "Your program’s …" and buttons named "Step run …".
