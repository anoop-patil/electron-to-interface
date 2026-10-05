# 12: Zoom level 6: Interpreter C code for the first Examples

**What to build:** A learner crosses the Interpreter handoff and sees, for the step run they selected, the real CPython C code that carried it out, each line paired with a plain-English sentence. When the step rewrote itself on that run, they see the general form's lines, then the new form's. This creates the Reference Library format, with real data for hello world and greet.py (prototypes v7 and v8); other programs fall back to hand-written text until ticket 29.

**Blocked by:** 10: Zoom level 5: Bytecode and plates; 11: Selecting anything highlights related Facts at every level

**Status:** ready-for-agent

- [x] The Reference Library format is in the JSON Schema. Each entry holds quoted lines of `Python/bytecodes.c` at tag `v3.14.2`, with exact line numbers, a plain-English sentence per line, and a note on what's shown.
- [x] Entries are keyed by handler and by how it ran (for example `CALL` for a Python function, for a C function, and when it rewrites itself). Entries for every handler that ran in hello world and greet.py are ported from prototypes v7 and v8.
- [x] The build fails if any quoted line doesn't match the source at its stated line numbers. Port the prototype's C-reference check (`prototype/tools/check-c-refs.mjs`) into CI.
- [x] Labeled Reference, with a link to the exact lines on GitHub at the pinned tag.
- [x] The selected step run decides what's shown (ADR 0007). A step that never ran says so.
- [x] The Interpreter handoff is explicit: by default, CPython never compiles your code to CPU instructions, with the experimental JIT caveat.
- [x] Steps with no Reference Library entry show a hand-written explanation, labeled Typical.
- [x] Try it yourself: links to the quoted lines on GitHub, plus the faster forms the learner's steps had become after the run, observed live (ticket 06). Ticket 06 confirmed Pyodide 314.0.7 rewrites steps as native CPython does.
- [x] CPython excerpts ship with the PSF License notice.

## Comments

- Ticket 10: each step records `afterRun`, the form it had become after the unwatched `python program.py` run, so Try it yourself can show it without running anything more. The recorded run itself rewrites no steps, because it is watched.
- Ticket 11: `src/zoom/selection.ts` links each zoom level to the others through Fact IDs. Level 6 shows the step run closest to the Selection until this ticket gives it elements of its own: add its Facts to `FACTS` and replace its entry in `LINKS`.

Built in `app/`. Decisions made along the way:

- The Reference Library is `app/reference/cpython-3.14.2.json`, defined in the schema as `ReferenceLibrary`. An entry's key is the handler, then, after a slash, how it ran when that changes the C shown: `CALL/python`, `CALL/c`, `CALL/rewrites`, `FOR_ITER/rewrites`, `FOR_ITER_TUPLE/ends`. The 29 entries are ported from v7 and v8, with sentences made general enough for any program that runs the handler that way. They can name a step's Facts, filled in like a step's Templates: `Get the name {name}`.
- For each Example, the Library records the handlers that ran on each step run. `app/reference/example_runs.py` derives them from the gdb captures in `prototype/data/`, lining them up with the analyzer's step runs, and pytest fails if the committed Library differs. The handlers match v8's exactly. greet.py's second RESUME ran no handler of its own: the Library records `RESUME_CHECK` inside `CALL_PY_EXACT_ARGS`.
- A Program gets the recorded handlers only if it is an Example, character for character, and its step runs are the recorded ones, in order. A Vitest test checks that Python in the browser runs the step runs of both Examples in the order gdb recorded natively; which handlers ran comes from the native recording alone. Any other Program gets a hand-written explanation from Templates, labeled Typical, and the form Python rewrote the step into, labeled Observed. A step of an Example that never ran, greet.py's `END_FOR`, shows its general form's C.
- The user chose to commit a copy of `bytecodes.c` at v3.14.2, in `app/reference/cpython-3.14.2/Python/`, rather than download it in CI. The content check (`checkContent.ts`) checks its SHA-256, then every quoted line, ignoring spaces, with a quote ending in … matching the start of its lines. It runs at the start of `vite build`, the dev server and Vitest, so CI runs it on every push. The prototype's own check stays as it was.
- Level 6's Honesty label is Reference when it shows C, else Typical (the panel label `noReference`). Under the C, the page says the handlers were recorded on our test machine, and that in the browser Python is the same C compiled to WebAssembly.
- Each handler links to its quoted lines on GitHub, one link for each stretch of nearby lines, so no link takes in code the page doesn't quote.
- Level 6's elements are step runs, as level 5's are, so it adds no Facts and keeps `STEP_RUN` in `LINKS`. `level5Selection` became `stepSelectionAt`, for levels 5 and 6. Level 6 reuses level 5's step lists and run bar.
- Each sentence sits above its line of C, not beside it: the zoom view is narrower than v8's, and side by side the C wrapped mid-word.
- The user chose `python -c "import dis; c = compile(open('program.py').read(), 'program.py', 'exec'); exec(c, dict(__name__='__main__')); dis.dis(c, adaptive=True)"` as level 6's command. It runs the Program, then shows its steps in the forms they had become. Its reading tab explains the first step of each rewrite. For greet.py, Pyodide's forms match v8's native capture.
- The site serves `licenses/CPython-LICENSE.txt` at `/licenses/CPython-LICENSE.txt`, copied there at build start. Level 6 states PSF's copyright notice under the C and links to the license.
- Concept cards CPython, The C language, Compiler, Machine code and Debugger are ported from v8. The Python itself card now says "By default".
