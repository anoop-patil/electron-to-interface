# 11: Selecting anything highlights related Facts at every level

**What to build:** When a learner picks anything at any zoom level, the matching part of their code and the related Facts at every other level light up, and zooming keeps the best match selected.

**Blocked by:** 08: Zoom level 3: Tokens; 09: Zoom level 4: Syntax tree; 10: Zoom level 5: Bytecode and plates

**Status:** ready-for-agent

- [ ] Selection links go through Fact IDs: a byte → its token → its syntax-tree node → its bytecode step, and back.
- [ ] The related source span is highlighted in the editor.
- [ ] Zooming to another level keeps the closest matching element selected, or a sensible default when nothing matches.
- [ ] At level 5 the selection is a step and one of its runs. Zooming to levels 6 and 7 keeps that step run, and levels 8 and 9 follow the line of output it printed (ADR 0007).
- [ ] The mapping is data, so levels 6 to 9 can plug into it.
- [ ] A Playwright test follows a byte of `print` through its token, node and `LOAD_NAME` step.
- [ ] In a multi-line Program, selecting an element highlights its own line in the editor, and nothing on other lines.

## Comments

- Ticket 09: a syntax-tree node with no place in the code, such as the Module or `arguments`, has no span. v8 picked the smallest node around a byte, skipping `arguments`, and fell back to the Module when none matched; this ticket can do the same.
- Ticket 10: level 5's Selection is a step run, `run-N`, or a step that never ran, `bc-N`; `level5Selection` in `src/explain/steps.ts` reads it. Any other Selection, such as a box from level 4, selects the first step run for now. Each step has a span, so a box or token can find its step through it.
