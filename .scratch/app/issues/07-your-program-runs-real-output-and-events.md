# 07: Your program runs: real output and Events

**What to build:** The learner's program actually runs, the Terminal panel shows what it printed, and each step of the run is recorded as an Event.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser

**Status:** ready-for-agent

- [x] The Analysis adds `stdout`, `stderr`, `error` and `events`, all covered by the JSON Schema.
- [x] Events (line, call, return, exception) are recorded with `sys.monitoring`, with a safe, truncated repr of locals, and Fact IDs `ev-N`.
- [x] The Terminal panel shows the real stdout: `Hello World!` for hello world, and everything a multi-line Program prints, in order.
- [x] The order the bytecode steps ran in is recorded with `sys.monitoring` INSTRUCTION events: each step run is a Fact (`run-N`) pointing at its step. RESUME isn't reported, so its runs are added where each code object starts.
- [x] Each line of output is tied to the step run that printed it.
- [x] Events and step runs are capped at 2,000 each, and the learner is told when a record was cut short.
- [x] For greet.py, the step runs match prototype v8's capture (`prototype/data/example-greet-cpython-3.14.2.json`).

## Comments

- Ticket 06 already runs the Program once, for level 1's Try it yourself (`python program.py`, in the Analysis's `commands`). The run this ticket records is separate; both should print the same.

Built in `app/`. Decisions made along the way:

- **Events come from `sys.monitoring`, not `sys.settrace`.** With `sys.settrace` on, CPython 3.14 reports no INSTRUCTION events at all, so step runs and Events couldn't be recorded in the same run. The user chose to record Events with the monitoring events `sys.settrace` is itself built on, used as it uses them (PY_START, PY_RESUME and PY_THROW for call; LINE, plus JUMP back to the start of the same line, for line; PY_RETURN, PY_YIELD and PY_UNWIND for return; RAISE for exception), so Events, step runs and output all come from one run. On ten test programs, from greet.py to generators, one-line loops and errors, the Events' kinds and lines match `sys.settrace`'s exactly (checked with CPython 3.14.3). Requirements.md says so now.
- **The Terminal shows the whole output at every zoom level.** Prototype v8 says "Nothing yet" at levels 1 to 4; with only levels 1 and 2 built, nobody would see the output. The user chose to show everything once Run finishes. Ticket 10 or 11 can make it follow the selected step run.
- The Program runs as `python program.py` would, from the same saved file as the Try it yourself commands, so a traceback names `/home/pyodide/program.py` in both. The analyzer now always saves the file, even with no commands.
- The Terminal shows stdout, then stderr in the terminal's error color. That is what a terminal shows for a traceback or a `sys.exit` message; a Program that writes to stderr between its prints shows them out of order.
- The Terminal sits between the editor and the Machine map, as in v8, with its own Observed chip (`terminal` in `honesty-labels.json`), because it stays beside every zoom level. A Program that prints nothing gets a sentence, and a cut-short record gets one note, true whichever record was cut; both are Templates (`terminal.nothingPrinted`, `terminal.cutShort`).
- A step run names its step by code object and offset: `code` counts the Program's code objects, the file's own first, then each one inside it, depth first, in the order Python stores them. Ticket 10's `bc-N` Facts can keep that order.
- RESUME's runs come from the PY_START and PY_RESUME events, at RESUME's own offset, so a generator also gets one each time it carries on after a yield.
- Text a step run printed is stored on it as `printed`. Text printed after the 2,000th step run isn't tied to any.
- `error` is the error's type, message and line in the Program, or null when the Program ends normally or calls `sys.exit`. An error class the Program defines gets an empty message, because getting it would run the Program's code.
- Recording never runs the learner's code. Values are sorted by exact type, which no object can fake. Python's own types (numbers, strings, bytes, ranges, lists, tuples, sets and dicts) are shown as `repr` shows them, cut to 80 characters and 20 items; functions, classes and modules by name; any other object as `<Point object>`, including objects of Python's own subclasses, such as a namedtuple. Names that start and end with `__` are left out of the locals.
- Only stdout is tied to step runs, as in v8's capture; stderr isn't.
- Each Run runs the Program twice: once recorded, once for level 1's Try it yourself.
