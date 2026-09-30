# v1 programs are up to 20 lines, any Python feature, typed then Run

The site is built around the learner's own Program, not hello world. In v1 a Program is at most **20 lines** and may use **any Python feature**. The learner types it, then clicks **Run**; nothing is analyzed while they type. An earlier plan allowed 300 lines, but the prototype and tickets only ever handled one line, which left a design gap at every zoom level. The decision set the real target: "at the minimum a few lines of code, a simple program", designed for about 20 lines. That is enough for variables, a loop, a function and several `print`s, and small enough that zoom levels 1–5 can show the whole Program at once instead of needing ways to move around thousands of bytes and tokens.

## Considered Options

- **One line only (as prototyped).** Rejected: the site can't be just hello world, and any real program has several lines.
- **Up to 300 lines.** Dropped for v1. Each zoom level would need its own way to show one part of a large Program in context, before any of it could be built.
- **A list of supported Python features.** Rejected: any valid Python 3.14.2 is allowed. The only limits are the standard library only (no third-party packages), nothing a browser can't do (threads, subprocesses, network access), and `input()` returning an empty string.
- **Re-analyzing as the learner types.** Rejected: the learner says when they're done by clicking Run. Editing after a Run marks the zoom view as out of date.

## Consequences

- Writing your own code is part of the walking skeleton (ticket 01), not a late add-on. Examples remain as starting points and still load instantly from build-time Analyses.
- The learner can type while Pyodide loads; Run works once it's ready.
- Arbitrary code reaches every token type, syntax-tree node and opcode, so the Templates (Phase 2) and the Reference Library (Phase 3) must cover them all, with honest fallbacks until they do.
- Some questions stay open and block tickets 06, 10, 12 and 14: which step levels 6–7 show, which output levels 8–9 follow, which run of a looped step the plates describe, and what Try it yourself shows for the learner's own Program (Requirements: Open questions).
- Raising the limit later means reopening how each zoom level shows a large Program.
