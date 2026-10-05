# 11: Selecting anything highlights related Facts at every level

**What to build:** When a learner picks anything at any zoom level, the matching part of their code and the related Facts at every other level light up, and zooming keeps the best match selected.

**Blocked by:** 08: Zoom level 3: Tokens; 09: Zoom level 4: Syntax tree; 10: Zoom level 5: Bytecode and plates

**Status:** ready-for-agent

- [x] Selection links go through Fact IDs: a byte → its token → its syntax-tree node → its bytecode step, and back.
- [x] The related source span is highlighted in the editor.
- [x] Zooming to another level keeps the closest matching element selected, or a sensible default when nothing matches.
- [x] At level 5 the selection is a step and one of its runs. Zooming to levels 6 and 7 keeps that step run, and levels 8 and 9 follow the line of output it printed (ADR 0007).
- [x] The mapping is data, so levels 6 to 9 can plug into it.
- [x] A Playwright test follows a byte of `print` through its token, node and `LOAD_NAME` step.
- [x] In a multi-line Program, selecting an element highlights its own line in the editor, and nothing on other lines.

## Comments

- Ticket 09: a syntax-tree node with no place in the code, such as the Module or `arguments`, has no span. v8 picked the smallest node around a byte, skipping `arguments`, and fell back to the Module when none matched; this ticket can do the same.
- Ticket 10: level 5's Selection is a step run, `run-N`, or a step that never ran, `bc-N`; `level5Selection` in `src/explain/steps.ts` reads it. Any other Selection, such as a box from level 4, selects the first step run for now (ticket 11 replaced this: it selects the closest step run). Each step has a span, so a box or token can find its step through it.

Built in `app/`. Decisions made along the way:

- The user chose to keep the Selection the learner picked as they zoom, rather than replace it with the closest match as v8 did. Each level shows its closest match to it, so a byte, zoomed to tokens and back, is the same byte again, and a step run survives zooming to level 4 and back. The Selection changes only when the learner picks something.
- `src/zoom/selection.ts` holds the links. Each kind of Fact says where it sits: its bytes, and for a step or step run, which one. Each zoom level says which Fact IDs are its own, how it finds its element closest to another Selection, and what it selects when nothing matches. A new level adds an entry to each table.
- Level 2 picks the first byte of the code; level 3 the token it starts in, or the next token, since the spaces between tokens belong to none; level 4 the smallest box around it, else the Module, as v8 did. Level 5 picks the step with exactly that code (so the Call box picks `CALL`), else the first step from inside it, else the smallest step around it, skipping RESUME; then that step's first run, or the step itself if it never ran.
- A Selection with no place in the code, such as `arguments`, the Module or a block's end (DEDENT, which has no bytes), selects where the Program starts: the first byte, the first token, the Module and the first step run. With no Selection at all, levels 2 to 4 still select nothing until the learner picks, as tickets 08 and 09 decided; level 5 selects the first step run.
- Levels 6 to 9 show the step run closest to the Selection, so they keep a run picked at level 5, and a token picked at level 3 reaches them as its step's first run. Tickets 12 to 15 replace those entries with their own elements; tickets 14 and 15 already list following the line of output that run printed.
- The editor is still a textarea (ticket 19 brings the code editor). A textarea can't mark its own text, so a copy of the code with the mark sits underneath it, in the same place and font, and scrolls with it. A highlight out of sight scrolls the editor to it. Editing the code after Run takes the highlight away, since its positions no longer match.
- The editor and level 1 highlight the code of what the level on screen shows selected: at level 4, a selected byte of `print` highlights the whole `print` box. A selected newline shows as ↵, also after the last line, because the Program always ends with a newline (ticket 01).
