# 06: Try it yourself

**What to build:** Each zoom level offers a real command the learner can run on their own computer, written for their own file, and shows what it shows: observed live in the browser wherever the browser can observe it, otherwise a labeled sample. Filled in for levels 1 and 2; each later level ticket adds its own.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [x] First, check two things in the browser and record the answers in this ticket: whether Pyodide 314.0.7 rewrites steps into faster forms, so `dis` with `adaptive=True` shows them after a run (level 6 depends on it); and how precise `time.perf_counter()` is in the supported browsers (level 7 may only be able to report the whole run). If steps aren't rewritten, level 6 shows the command with the Example's captured output, labeled as the Example's. Answers under Comments.
- [x] Collapsed by default to one row that shows the command, using the learner's own file name.
- [x] Expanded, it has three tabs: what each part of the command does, what it shows, and how to read every number in it.
- [x] For the learner's own program, what it shows is generated live wherever the browser can observe it, and labeled Observed (Requirements: Zoom UI): levels 1–5 the command's exact output, level 6 the forms steps had become after the run, level 7 the browser's own time and step count (with the WebAssembly note), level 8 the bytes `print` handed to `sys.stdout`. Done for levels 1 and 2; tickets 08, 09, 10, 12, 13 and 14 each add their level's.
- [x] Commands the browser can't run (native timing, `strace`) show a sample output captured with CPython 3.14.2 on Linux x86-64, labeled as the Example's, with the platform stated. No command at levels 1 and 2 needs one; tickets 13 and 14 add theirs.
- [x] For the Examples, every output is captured in advance. A test confirms that the live output for levels 1–5 matches the captured output of each Example, character for character. The app has no Examples until ticket 16, so the test runs greet.py and compares with its capture in `prototype/data/`.
- [x] Content for levels 1 and 2 is ported from prototype v8.
- [x] Whether the section is open, and which tab is showing, stays the same as the learner moves between levels.

## Comments

Built in `app/`. Decisions made along the way:

- **The browser checks**, run with Pyodide 314.0.7 in Playwright's Chromium 153, Firefox 155 and WebKit 26.6, none of them cross-origin isolated:
  - Steps are rewritten. After greet.py runs, `dis` with `adaptive=True` shows the same forms in all three browsers as the native capture in `prototype/data/` (for example `CALL_PY_EXACT_ARGS`, `FOR_ITER_TUPLE`, `LOAD_GLOBAL_BUILTIN`). So level 6 can show the learner's own forms, observed.
  - `time.perf_counter()` moves in steps of 0.1 ms in Chromium and 1 ms in Firefox and WebKit. greet.py runs in about 0.2 ms, so Firefox and Safari measure it as 0. Level 7 can report only the whole run, and only for programs that take several milliseconds.
- The user chose the file name `program.py` until file upload (ticket 19) supplies the learner's own. The Analysis records it as `fileName`. Since ticket 19, an uploaded file's name is used, made safe to type.
- The user chose to run the Program now, for level 1's output, before the 5-second stop for runaway code. Ticket 20 added it: `while True: pass` is stopped, in the recorded run and in the command alike.
- The browser's Python runs each command on the Program, so the output is observed. The analyzer saves the Program as `program.py` in Python's working folder in the browser (`/home/pyodide`, in memory, never on the disk), then does what `python program.py` or `python -c "…"` does: the same `sys.argv`, `__main__`, `__file__` and working folder, with stdout and stderr together in the order they were written, as a terminal shows them. It records the output and the exit status in the Analysis's `commands`. It runs in the analyzer's own Python rather than a new one, so modules imported earlier stay imported. A traceback names `/home/pyodide/program.py`; the reading notes say the learner's own folder appears there instead.
- The commands, their parts and the reading notes are in `app/templates/py314.json`, under `tryIt`, by zoom level. A command may use only `{file}`, because the page works out the commands before the Program has other Facts; the build checks this, and checks the rest like a Template. `src/explain/tryIt.ts` fills them in.
- The output tab carries the Observed label as a panel (`tryItOutput` in `honesty-labels.json`), with the sentence "Your browser’s Python did what this command does, on your program, just now."
- Changes from prototype v8:
  - Level 1's reading notes are general, not greet.py's line by line: what the lines are, or how to read a traceback; nothing extra after `sys.exit("bye")`. A Program that prints nothing gets a sentence instead of an empty terminal.
  - Level 2's rows say what each line holds, as v8's did, also for a line of only spaces. Notes on numbers from 128 to 255 and on tabs appear when the Program has them, and a note on Windows editors that end lines with 13 then 10 is new.
  - The Terminal Concept card is new to the app, ported from v8's without its links to cards that don't exist yet (doors, font). Its analogy is new, to stay in the kitchen: the order window.
- The tabs are built by hand on the ARIA tabs pattern, not taken from shadcn/ui: the arrow keys, Home and End move between them. The user chose this after review, and Requirements.md now says so.
