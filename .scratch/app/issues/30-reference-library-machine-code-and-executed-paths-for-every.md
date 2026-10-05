# 30: Reference Library: machine code and executed paths for every variant

**What to build:** Zoom level 7 shows real machine code, and the path that ran, for any program's steps.

**Blocked by:** 13: Zoom level 7: CPU instructions for the first Examples; 29: Reference Library: C source for every opcode and variant

**Status:** ready-for-agent

- [ ] Machine instructions for every opcode and specialized variant come from the pinned binary, including their `.warm` and `.cold` parts (ADR 0003).
- [ ] When the build copied one handler's code into another, the page says so for the step whose work ran there.
- [ ] Conditional jumps that ran but weren't taken are described as checks, not as jumps.
- [ ] Executed paths are recorded with gdb by tracing small programs that exercise each variant.
- [ ] The page says honestly that the highlighted path was recorded on a small test program, not on the learner's own run, and names that program.
- [ ] A details panel states the compiler, flags (Clang, tail-calling interpreter, PGO, LTO, BOLT) and CPU architecture.
- [ ] Any program reaches level 7 with an exact or closest match, and no network call beyond static files.

## Comments

- Ticket 13: the Reference Library's `machineCode` holds each handler's instructions, main part then `.warm` and `.cold`, and each handler run of an Example its `path`, `calls` and the `values` gdb read at inc and dec instructions (`app/reference/example_runs.py`). The build fails if a path runs an instruction its handler doesn't have, or a note states a number neither recorded nor in its instruction. Level 7 already describes a conditional jump that ran but didn't jump as a check, says which step run ran another handler's copied code, and names the Example the path was recorded on. To find copied code, line numbers aren't enough: the compiler gives several handlers' last jump a line of RESUME_CHECK's. The Library is about 585 kB with two Examples' handlers; every variant may call for loading it only when level 7 opens.
