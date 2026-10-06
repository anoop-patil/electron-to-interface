# 20: Runaway code stops after 5 seconds, and input() returns nothing

**What to build:** A learner's infinite loop or `input()` call can't freeze the page.

**Blocked by:** 19: Code editor, file upload and the 20-line limit

**Status:** ready-for-agent

- [x] Execution stops after 5 seconds by terminating and recreating the worker. `while True: pass` ends cleanly with a message, and the page stays responsive. Since ticket 06, Run already runs the Program (for level 1's Try it yourself), so for now `while True: pass` leaves Run waiting.
- [x] `input()` returns an empty string, with a visible note.

## Comments

- Ticket 18: one line nested deeper than Python's own parser and compiler can go in the browser, such as `print(1+1+…+1)` with 3,000 terms in Chromium, runs out of stack in `compile`. Pyodide calls that a fatal error, and the page shows "RangeError: Maximum call stack size exceeded". In ticket 18's tests the next Run still worked, but Pyodide gives no promise after a fatal error. Recreating the worker should recover from that too, with a plain message that the line is nested too deeply for the Python in the browser.
- Ticket 16: Run is off while a Run is in progress (`running` in `App.tsx`), and the zoom view is marked `aria-busy`; the e2e helper `run()` waits for that to end. Recreating the worker needs to end it too. Where `src/engine/support.ts` finds the browser can't run Python, there is no worker at all.

Built in `app/`. Decisions made along the way:

- The 5 seconds count only while code runs. The analyzer calls `clock(True)` just before it runs the Program, or a Try it yourself command, and `clock(False)` just after; the worker passes each on to the page, which starts and stops a 5-second timer. Compiling and the rest of the analysis don't count, and each run gets its own 5 seconds, so a Program that takes 3 seconds runs twice (once watched, once as `python program.py`) and still finishes.
- When the timer runs out, `src/engine/engine.ts` ends the worker and starts a new one. The Run fails with `RunStopped`, whose reason is `timeout`; a Run waiting behind it goes to the new worker. Run is off, with a note, until the new Python has started, which takes a few seconds. The zoom view keeps the last Program that finished.
- A fatal Pyodide error (`pyodide_fatal_error` on the error) also ends the worker and starts a new one. Running out of the browser's stack is `tooDeep`: a RangeError in Chrome, "too much recursion" in Firefox. Anything else fatal is `crashed`. `print(1+1+…+1)` with 3,000 terms now gets a note in Chromium that the Python in the browser ran out of room working through it, as a line nested very deeply does.
- The notes are `stopNote` and `inputNote` in `src/editor/limits.ts`, under Run. The stop note goes at the next Run or Example pick. A Run left running when the learner picks an Example, and stopped later, gets no note; the page only says Python is starting again.
- Not covered: the 5 seconds are timed on the page, so an Analysis that arrives just as the timer runs out can still be stopped.
- `input()` reads from a stand-in `sys.stdin` that gives an empty line each time it is asked for one, as if Enter were pressed with nothing typed, so `input()` returns `''`. Reading to the end, with `read()`, `readlines()` or a `for` loop, finds nothing, so those end rather than run until stopped; each still counts as a read. The Try it yourself commands get the same stand-in.
- The Analysis gains `stdinReads`: how many times the recorded run read from `sys.stdin`. A Run that read any gets the note "Your program asked for input N times. Nothing can be typed into a program here, so input() always returns an empty string." The prompt `input()` writes is in the Terminal, with the next output straight after it on the same line, as when a program's input comes from a file rather than a keyboard.
- Tests: `src/engine/engine.test.ts` drives the engine with a stand-in worker and fake timers; `e2e/runaway.spec.ts` runs `while True: pass`, zooms while it runs, runs `input()`, and runs the 3,000-term line, then Runs again.
