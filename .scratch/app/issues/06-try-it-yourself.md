# 06: Try it yourself

**What to build:** Each zoom level offers a real command the learner can run on their own computer, written for their own file, and shows what it shows: observed live in the browser wherever the browser can observe it, otherwise a labeled sample. Filled in for levels 1 and 2; each later level ticket adds its own.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [ ] First, check two things in the browser and record the answers in this ticket: whether Pyodide 314.0.7 rewrites steps into faster forms, so `dis` with `adaptive=True` shows them after a run (level 6 depends on it); and how precise `time.perf_counter()` is in the supported browsers (level 7 may only be able to report the whole run). If steps aren't rewritten, level 6 shows the command with the Example's captured output, labeled as the Example's.
- [ ] Collapsed by default to one row that shows the command, using the learner's own file name.
- [ ] Expanded, it has three tabs: what each part of the command does, what it shows, and how to read every number in it.
- [ ] For the learner's own program, what it shows is generated live wherever the browser can observe it, and labeled Observed (Requirements: Zoom UI): levels 1–5 the command's exact output, level 6 the forms steps had become after the run, level 7 the browser's own time and step count (with the WebAssembly note), level 8 the bytes `print` handed to `sys.stdout`.
- [ ] Commands the browser can't run (native timing, `strace`) show a sample output captured with CPython 3.14.2 on Linux x86-64, labeled as the Example's, with the platform stated.
- [ ] For the Examples, every output is captured in advance. A test confirms that the live output for levels 1–5 matches the captured output of each Example, character for character.
- [ ] Content for levels 1 and 2 is ported from prototype v8.
- [ ] Whether the section is open, and which tab is showing, stays the same as the learner moves between levels.
