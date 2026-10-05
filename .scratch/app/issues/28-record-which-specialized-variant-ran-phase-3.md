# 28: Record which specialized variant ran (Phase 3)

**What to build:** A learner sees which specialized form each bytecode step became, for example `BINARY_OP_ADD_INT`, so levels 6 and 7 can show the exact code that ran.

**Blocked by:** 10: Zoom level 5: Bytecode and plates

**Status:** ready-for-agent

- [x] The analyzer records, after the run, the specialized form each step had become (`dis` with `adaptive=True`), as a Fact.
- [ ] For the Examples, which handler ran on every step run is recorded at build time with gdb, labeled Reference (`prototype/tools/capture-example.sh`). How to show earlier runs of the learner's own program is an open question in Requirements.
- [ ] Level 5 shows it next to the generic opname.
- [ ] The page explains that a step runs in its general form at first, and is rewritten after it has run a few times. (In greet.py, gdb recorded `CALL` running in its general form on its first run; on its second, it rewrote itself into `CALL_PY_EXACT_ARGS` and handed over within the same step run.)

## Comments

- Ticket 10 records each step's `afterRun`. The recorded run can't show any form, because Python rewrites no steps while `sys.monitoring` reports every one, so the forms come from the unwatched `python program.py` run. Level 5 shows a rewritten step's form in its Explanation, labeled Observed, not yet next to the opname in the step list.
- Ticket 12: the Reference Library records, for hello world and greet.py, which handlers ran on every step run, from the gdb captures in `prototype/data/` (`app/reference/example_runs.py`). Level 6 shows them, labeled Reference. The capture still runs by hand; ticket 13 makes the capture tools run in CI.
