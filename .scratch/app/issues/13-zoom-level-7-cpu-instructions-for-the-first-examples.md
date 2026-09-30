# 13: Zoom level 7: CPU instructions for the first Examples

**What to build:** A learner sees the real machine code of every handler that ran for the step run they selected, with the instructions that actually ran highlighted and the key ones explained, as in prototype v8.

**Blocked by:** 12: Zoom level 6: Interpreter C code for the first Examples

**Status:** ready-for-agent

- [ ] Reference Library entries gain, for each handler that ran in hello world and greet.py: machine instructions and their bytes, including the `.warm` and `.cold` parts, and the functions they call. They come from python-build-standalone's CPython 3.14.2 (release 20251205, x86-64 Linux), with the binary's sha256 checked (ADR 0003).
- [ ] They also gain the path that ran on every step run, recorded with gdb, one instruction at a time, over 3 identical runs (`capture-example.sh`; `trace-handler-paths.sh` for hello world). The path is labeled Reference.
- [ ] The prototype's data tools run reproducibly on Linux in CI, and their output is committed.
- [ ] The view matches prototype v8: each handler that ran on the step run, in turn; instruction kinds; key lines in the order they ran; the instructions that ran, in order; and the full listing with the path highlighted. Conditional jumps that ran but weren't taken are described as checks. Hello world's line-by-line notes for `LOAD_NAME`, `CALL` and `RETURN_VALUE` are ported from prototype v7. The registers panel is labeled Derived.
- [ ] When a step's work ran inside another handler (greet.py's second `RESUME`, run as `RESUME_CHECK` code at the end of `CALL_PY_EXACT_ARGS`), the page says so and points to it.
- [ ] Every value a note states (reference counts, counters, sizes) is backed by the recorded data or a gdb probe. Nothing is guessed.
- [ ] No network call beyond static files. Steps with no entry fall back to Typical.
- [ ] Try it yourself: a timing command for the learner's file. The browser's own time and step count are observed live, with the WebAssembly note; native timing is a labeled sample (ticket 06).
