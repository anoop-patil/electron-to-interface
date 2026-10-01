# 20: Runaway code stops after 5 seconds, and input() returns nothing

**What to build:** A learner's infinite loop or `input()` call can't freeze the page.

**Blocked by:** 19: Code editor, file upload and the 20-line limit

**Status:** ready-for-agent

- [ ] Execution stops after 5 seconds by terminating and recreating the worker. `while True: pass` ends cleanly with a message, and the page stays responsive. Since ticket 06, Run already runs the Program (for level 1's Try it yourself), so for now `while True: pass` leaves Run waiting.
- [ ] `input()` returns an empty string, with a visible note.
