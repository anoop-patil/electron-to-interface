# 31: Coverage report for the Coverage corpus

**What to build:** We know how often level 7 shows an exact match for what learners' code actually runs, which is the measure that decides whether live native tracing is ever reopened (ADR 0002).

**Blocked by:** 30: Reference Library: machine code and executed paths for every variant

**Status:** ready-for-agent

- [ ] A Coverage corpus of real beginner programs is analyzed in CI.
- [ ] Each change publishes a report showing what share of level-7 zooms find an exact match in the Reference Library.
