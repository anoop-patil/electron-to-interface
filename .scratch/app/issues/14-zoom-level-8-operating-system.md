# 14: Zoom level 8: Operating system

**What to build:** A learner follows one line of output from their program, through a system call, into the operating system and on to the terminal app. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 07: Your program runs: real output and Events; 11: Selecting anything highlights related Facts at every level

**Status:** ready-for-agent

- [x] The line followed is the one printed by the selected step run, and the learner can pick any other line (ADR 0007).
- [x] Stages: program → system call → kernel → terminal, with the bytes shown moving as a packet, as in prototype v8.
- [x] Byte counts come from the real stdout: 13 for hello world; 11 and 13 for greet.py's two lines. Each line is one system call.
- [x] Hand-written and labeled Typical, and the text carries its own qualifier ("On a typical Linux terminal...").
- [x] A panel shows the three numbered doors (file descriptors). Concept cards cover system call and doors; the terminal card came with ticket 06.
- [x] Try it yourself: an `strace` command for the learner's file, with a sample output captured on the stated platform, labeled as the Example's. The bytes `print` handed to `sys.stdout`, piece by piece, are observed live (ticket 06).

## Comments

- Ticket 11: `src/zoom/selection.ts` links each zoom level to the others through Fact IDs. Level 8 shows the step run closest to the Selection until this ticket gives it its lines of output: add its Facts to `FACTS` and replace its entry in `LINKS`. The `Anchor` of a step run carries the run, so the entry can find the line it printed.
- Ticket 13: Try it yourself can show a sample beside the browser's output: `TryItExplanation.sample`, labeled with the panel `tryItSample` (Reference). Level 7's samples are in the Reference Library, one for each Example, from `prototype/data/example-*-cpython-3.14.2.json`; any other Program shows greet.py's. greet.py's capture already holds an `strace` output, but hello world's doesn't yet.

Built in `app/` and `prototype/tools/`. Decisions made along the way:

- The analyzer records `writes`: each piece the Program hands to `sys.stdout` (door 1) or `sys.stderr` (door 2), and each flush, in order, with the step run that did it. The first 2,000 of the Program's own are kept (`writesCutShort`), then Python's own report: the message `sys.exit` was given, or the traceback. In a terminal, Python 3.14 colors a traceback, so the analyzer records it a second time with `colorize=True` for `writes`; the Terminal panel still shows it plain.
- The user chose to work out the system calls from the pieces with Python's rules, rather than always one per line. `src/explain/output.ts` holds the model: a text layer that gathers pieces into chunks of 8,192 bytes, over a buffer of 131,072 bytes, which sends what it holds when a piece holds a newline or a carriage return, on a flush, when the next chunk won't fit, and when the Program stops, stderr's first, before the traceback. strace on the test machine's CPython 3.14.2 confirmed each case, including `print("a\nb")` (two calls), `print(x, end="")`, `flush=True`, a 10,000-byte line (one call), a 200,000-byte one (two) and thirty 5,000-byte pieces (130,000 bytes, then 20,000). The sizes are that Python's `io.DEFAULT_BUFFER_SIZE` and `TextIOWrapper._CHUNK_SIZE`.
- The user chose to follow traceback lines too. Level 8 lists every line of output, on both doors, in the order the calls that finish them happened. A line written to stderr shows "door 2". A traceback's pieces are labeled Derived (`reportPieces`), since its colors are worked out for a terminal; the Program's own are Observed (`outputPieces`). A traceback line names the file by the browser's folder, `/home/pyodide`, and says its bytes differ on the learner's computer.
- Lines of output are Facts, `out-0` and on; level 8's elements are a line at one of the 5 stages, `out-N-S`, so the Machine map can follow the stage. `anchorOf` now reads a Fact ID's kind up to its first dash. A line anchors to the step run that wrote its last piece, and a traceback's to the last step run, which raised the error. From another level, level 8 picks the line the closest step run printed, else the next one printed after it, at stage 1; picking another line keeps the stage.
- Stage texts depend on the line: a newline or none, sent at a flush, when the buffer was full, at the end, or with the line before's newline; color codes; a call that carries other lines too; a line sent in several calls. "Python makes N calls" says "at least" when the record was cut short. A Program cut short before it finished a line says there is no whole line to follow.
- The user chose to capture hello world's own strace: `trace-handler-paths.sh` now runs strace too, and its earlier timing value was kept, since CI ignores timing. The Reference Library's Examples now hold `samples` by zoom level: 7's timing and 8's strace, without strace's colors or the Example's own lines (`strace_output` in `example_runs.py`). Any other Program shows greet.py's.
- Try it yourself's command, `strace -e trace=write python {file}`, is marked `inBrowser: false`, so the worker doesn't run it. In its place the page shows the pieces and flushes the browser recorded, a row per line, Observed, and leaves out a traceback. The reading tab's rows explain a line of strace's output with the Program's own first call.
- The doors panel and the `fd` card share the doors' text, kept in the card's new `doors` visual. Cards `syscall` and `fd` join the Concepts index.
- The packet slides into its zone (`animate-packet`) unless motion is reduced: the page's only animation besides the zoom.
- The build now fails on a slot inside a card's words, `[[fd|door {door}]]`, which would reach the page unfilled.
