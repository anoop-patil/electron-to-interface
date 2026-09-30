# What the learner selects decides what the deeper levels show

A program of up to 20 lines (ADR 0006) has many steps, and steps inside a loop or a function run more than once. Levels 1–5 show the whole program. Below that, the page follows the learner's Selection: at level 5 they select a Step and one of its Step runs, levels 6 and 7 show what the interpreter did for that Step run, and levels 8 and 9 follow the line of output it printed, with a way to pick any other line. Every Step run is its own view, because runs really differ. Prototype v8 recorded it for greet.py: the plates differ from one run to the next, and on the second trip round the loop `CALL` rewrote itself into `CALL_PY_EXACT_ARGS` and ran that, a different handler from the first run. The user tried this in prototype v8 and chose it.

## Considered Options

- **A separate Focus: the learner picks a line, and every level shows that line's part in context.** Rejected: it adds a second thing to pick alongside the Selection, and a line isn't specific enough below level 5, where one line holds several steps that each run several times.
- **Show only the first run of each step.** Rejected: it hides what happens in loops, including steps rewriting themselves into faster forms, and would claim one run stands for all.
- **Show all runs of a step at once.** Rejected for levels 6–7: two runs can run different handlers, so the page would have to show several handlers side by side. Level 5 shows how many times each step ran, and the order, and the learner picks one run.

## Consequences

- The Analysis records Step runs in order (`sys.monitoring` INSTRUCTION events, with RESUME added where each code object starts) and ties each line of output to the Step run that printed it.
- Level 5's Next and Back follow the order the steps ran in, moving between code objects.
- Plates are shown per frame, after the selected Step run, and are labeled Derived.
- For the Examples, which handler ran on each Step run comes from gdb at build time (Reference). For the learner's own program, only the form each step had become after the run is known; how levels 6–7 show earlier runs is still open (Requirements: Open questions).
