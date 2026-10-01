# 10: Zoom level 5: Bytecode and plates

**What to build:** A learner sees every code object's steps, how often each ran and the order they ran in, and can pick any run of any step to see the plates (stack) of every frame after it. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes; 03: Explanations come from Templates filled with Facts; 04: Honesty labels and Concept cards; 05: Machine map; 06: Try it yourself

**Status:** ready-for-agent

- [x] `analyze()` returns the bytecode of every code object (the file, and each function, class body, lambda and generator expression) from `dis`: offset, opname, argument and raw bytes for each step, as Facts `bc-N`. Bytecode is never hardcoded.
- [x] Each code object's steps are listed under its name, plain-English names first (for example "Find greet · `LOAD_NAME`"), with how many times each step ran. A step that never ran is marked, like greet.py's `END_FOR`.
- [x] Next, Back and Play follow the order the steps ran in, moving between code objects, and a strip shows every step run in order. Any run of a step can be picked directly.
- [x] After the selected step run, the plates of every frame are shown, the caller's frame waiting under the one it called, with each frame's variables. The plates and the objects they point to are labeled Derived: replayed from the step runs with Python's rules.
- [x] Each code object's recipe card (names, fixed values, its own variables) is labeled Observed.
- [x] Where Python records it, the specialized form a step had become after the run is shown, labeled Observed.
- [x] The machine map lights your steps, objects and plates, with counts across frames.
- [x] Try it yourself: `python -m dis` on the learner's file: captured output for the Examples, live output for the learner's own program (ticket 06).

## Comments

- Since ticket 07, the Analysis's step runs (`run-N`) and Events (`ev-N`) name a code object by its index: the file's own first, then each one inside it, depth first, in the order Python stores them (`_code_objects` in `analyze.py`). List the bytecode in that order, so `code` and `offset` find a step's `bc-N`.

Built in `app/`. Decisions made along the way:

- Each step is a Fact, `bc-N`, numbered across the code objects in the order step runs count them. It records its offset, opname, argument and what dis says it means, its two bytes, the cache entries after it, its line, its span in bytes and where it jumps. dis names a code object by its address and file; the step names it `<code object greet>` instead.
- Each code object records its names, fixed values, own variables, the variables it shares with the code around or inside it, and its size in bytes. Its recipe card marks the entry the selected step's argument points to.
- The plates are replayed while the Program runs, in `analyze.py`. How many plates each kind of step takes and puts back comes from CPython 3.14.2's `pycore_opcode_metadata.h`, and which of them it leaves as they were (FOR_ITER keeps the walker) from the stack signatures in `bytecodes.c`. A test checks the table against `dis.stack_effect`.
- A plate points to an object where the replay can tell which: a fixed value, or a variable or name read just before the step runs. A computed answer, such as a call's result or a sum, gets its object once a variable stores it, a frame returns it, or a generator yields it to a loop; the plate shows it from the start, since it held that object all along. Otherwise it shows "the answer of step N". A call into one of the Program's functions puts its answer on the caller's plates when that function returns.
- The replay never runs the learner's code: attributes are looked up in the classes' own dictionaries, and isinstance, which can ask an object for its `__class__`, is never used. It holds none of the Program's objects longer than Python does: only those on a plate, which the frame's stack holds anyway, and those that can't hold others, such as numbers and text. A list that changes is shown as it was when last seen; the replay reads the running frame's variables at each step.
- An error caught by a `try` resets the frame's plates to the depth the exception table gives and puts the error on top. If the rules ever can't account for a frame's plates, its step runs say so (`platesUnsure`) and level 5 shows none for it, rather than a guess. A test runs 15 programs, from generators to `match`, and checks that this never happens and that every frame returns with one plate.
- The frames after a step run are those standing when the next step runs: its frame and the frames waiting under it. So a call's new frame appears after the call, as in v8. After the last step run, no frames are left.
- While `sys.monitoring` reports every step, Python rewrites none of them, so the recorded run can't say what a step became. The forms come from the run of `python program.py` for level 1's Try it yourself, which isn't watched. The Explanation of a rewritten step says so, labeled Observed. For greet.py, they match v8's capture.
- Object sizes come from `sys.getsizeof`, only for Python's own types: the Program's own class could run its code to answer. Python in the browser is 32-bit WebAssembly, so its sizes are smaller than v8's from 64-bit Linux ('Hello,' is 27 bytes, not 47), and the Objects panel says so. The panel lists every object seen so far and outlines those still in use, as v8's shelf did.
- About 80 opnames and variants have their own Template, plain name first; any other step gets `step.other`, which names its opname. A run of FOR_ITER says which trip round the loop it is, or that the loop ended and where Python went next. A call's run says what it printed, and whether it set up a frame. v8's greet.py-only sentences, such as the list stored as a tuple, are left out.
- The strip draws every step run as a small button; only the selected one is in the tab order, and the left and right arrow keys move along it. A step that ran more than 20 times gets Earlier run and Later run buttons instead of one button per run.
- Concept cards Frame and None are ported from v8.
- Lit parts inside the Machine map's RAM group now show their small print in a darker grey, which the dark theme's contrast check needs.
