# 20: Runaway code stops after 5 seconds, and input() returns nothing

**What to build:** A learner's infinite loop or `input()` call can't freeze the page.

**Blocked by:** 19: Code editor, file upload and the 20-line limit

**Status:** ready-for-agent

- [ ] Execution stops after 5 seconds by terminating and recreating the worker. `while True: pass` ends cleanly with a message, and the page stays responsive. Since ticket 06, Run already runs the Program (for level 1's Try it yourself), so for now `while True: pass` leaves Run waiting.
- [ ] `input()` returns an empty string, with a visible note.

## Comments

- Ticket 18: one line nested deeper than Python's own parser and compiler can go in the browser, such as `print(1+1+…+1)` with 3,000 terms in Chromium, runs out of stack in `compile`. Pyodide calls that a fatal error, and the page shows "RangeError: Maximum call stack size exceeded". In ticket 18's tests the next Run still worked, but Pyodide gives no promise after a fatal error. Recreating the worker should recover from that too, with a plain message that the line is nested too deeply for the Python in the browser.
- Ticket 16: Run is off while a Run is in progress (`running` in `App.tsx`), and the zoom view is marked `aria-busy`; the e2e helper `run()` waits for that to end. Recreating the worker needs to end it too. Where `src/engine/support.ts` finds the browser can't run Python, there is no worker at all.
