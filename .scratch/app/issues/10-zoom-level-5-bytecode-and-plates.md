# 10: Zoom level 5: Bytecode and plates

**What to build:** A learner sees every code object's steps, how often each ran and the order they ran in, and can pick any run of any step to see the plates (stack) of every frame after it. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes; 03: Explanations come from Templates filled with Facts; 04: Honesty labels and Concept cards; 05: Machine map; 06: Try it yourself

**Status:** ready-for-agent

- [ ] `analyze()` returns the bytecode of every code object (the file, and each function, class body, lambda and generator expression) from `dis`: offset, opname, argument and raw bytes for each step, as Facts `bc-N`. Bytecode is never hardcoded.
- [ ] Each code object's steps are listed under its name, plain-English names first (for example "Find greet · `LOAD_NAME`"), with how many times each step ran. A step that never ran is marked, like greet.py's `END_FOR`.
- [ ] Next, Back and Play follow the order the steps ran in, moving between code objects, and a strip shows every step run in order. Any run of a step can be picked directly.
- [ ] After the selected step run, the plates of every frame are shown, the caller's frame waiting under the one it called, with each frame's variables. The plates and the objects they point to are labeled Derived: replayed from the step runs with Python's rules.
- [ ] Each code object's recipe card (names, fixed values, its own variables) is labeled Observed.
- [ ] Where Python records it, the specialized form a step had become after the run is shown, labeled Observed.
- [ ] The machine map lights your steps, objects and plates, with counts across frames.
- [ ] Try it yourself: `python -m dis` on the learner's file: captured output for the Examples, live output for the learner's own program (ticket 06).

## Comments

- Since ticket 07, the Analysis's step runs (`run-N`) and Events (`ev-N`) name a code object by its index: the file's own first, then each one inside it, depth first, in the order Python stores them (`_code_objects` in `analyze.py`). List the bytecode in that order, so `code` and `offset` find a step's `bc-N`.
