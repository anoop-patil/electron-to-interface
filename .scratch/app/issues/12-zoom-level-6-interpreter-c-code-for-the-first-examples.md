# 12: Zoom level 6: Interpreter C code for the first Examples

**What to build:** A learner crosses the Interpreter handoff and sees, for the step run they selected, the real CPython C code that carried it out, each line paired with a plain-English sentence. When the step rewrote itself on that run, they see the general form's lines, then the new form's. This creates the Reference Library format, with real data for hello world and greet.py (prototypes v7 and v8); other programs fall back to hand-written text until ticket 29.

**Blocked by:** 10: Zoom level 5: Bytecode and plates; 11: Selecting anything highlights related Facts at every level

**Status:** ready-for-agent

- [ ] The Reference Library format is in the JSON Schema. Each entry holds quoted lines of `Python/bytecodes.c` at tag `v3.14.2`, with exact line numbers, a plain-English sentence per line, and a note on what's shown.
- [ ] Entries are keyed by handler and by how it ran (for example `CALL` for a Python function, for a C function, and when it rewrites itself). Entries for every handler that ran in hello world and greet.py are ported from prototypes v7 and v8.
- [ ] The build fails if any quoted line doesn't match the source at its stated line numbers. Port the prototype's C-reference check (`prototype/tools/check-c-refs.mjs`) into CI.
- [ ] Labeled Reference, with a link to the exact lines on GitHub at the pinned tag.
- [ ] The selected step run decides what's shown (ADR 0007). A step that never ran says so.
- [ ] The Interpreter handoff is explicit: by default, CPython never compiles your code to CPU instructions, with the experimental JIT caveat.
- [ ] Steps with no Reference Library entry show a hand-written explanation, labeled Typical.
- [ ] Try it yourself: links to the quoted lines on GitHub, plus the faster forms the learner's steps had become after the run, observed live (ticket 06). Ticket 06 confirmed Pyodide 314.0.7 rewrites steps as native CPython does.
- [ ] CPython excerpts ship with the PSF License notice.

## Comments

- Ticket 10: each step records `afterRun`, the form it had become after the unwatched `python program.py` run, so Try it yourself can show it without running anything more. The recorded run itself rewrites no steps, because it is watched.
