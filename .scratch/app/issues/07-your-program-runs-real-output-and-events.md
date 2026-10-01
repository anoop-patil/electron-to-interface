# 07: Your program runs: real output and Events

**What to build:** The learner's program actually runs, the Terminal panel shows what it printed, and each step of the run is recorded as an Event.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser

**Status:** ready-for-agent

- [ ] The Analysis adds `stdout`, `stderr`, `error` and `events`, all covered by the JSON Schema.
- [ ] Events (line, call, return, exception) are recorded with `sys.settrace`, with a safe, truncated repr of locals, and Fact IDs `ev-N`.
- [ ] The Terminal panel shows the real stdout: `Hello World!` for hello world, and everything a multi-line Program prints, in order.
- [ ] The order the bytecode steps ran in is recorded with `sys.monitoring` INSTRUCTION events: each step run is a Fact (`run-N`) pointing at its step. RESUME isn't reported, so its runs are added where each code object starts.
- [ ] Each line of output is tied to the step run that printed it.
- [ ] Events and step runs are capped at 2,000 each, and the learner is told when a record was cut short.
- [ ] For greet.py, the step runs match prototype v8's capture (`prototype/data/example-greet-cpython-3.14.2.json`).

## Comments

- Ticket 06 already runs the Program once, for level 1's Try it yourself (`python program.py`, in the Analysis's `commands`). The run this ticket records is separate; both should print the same.
