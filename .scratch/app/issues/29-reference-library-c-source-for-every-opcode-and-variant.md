# 29: Reference Library: C source for every opcode and variant

**What to build:** Zoom level 6 shows real C source for any program's steps, not just the first Examples'.

**Blocked by:** 12: Zoom level 6: Interpreter C code for the first Examples; 25: Template generator (Phase 2); 28: Record which specialized variant ran (Phase 3)

**Status:** ready-for-agent

- [ ] A Reference Library builder produces C source entries for every opcode and specialized variant in 3.14.2, from `bytecodes.c` at the pinned tag, validated against the schema and line-checked in CI.
- [ ] Each quoted line's plain-English sentence comes through the Template pipeline and is reviewed like other Templates.
- [ ] When there's no exact match for what ran, the closest variant is shown, still labeled Reference, with a note saying it's the closest match.

## Comments

- Ticket 12: the format is `ReferenceLibrary` in the schema, and the content check already checks every entry's lines against `app/reference/cpython-3.14.2/Python/bytecodes.c`. Entries' sentences can use a step's slots. A Program that isn't an Example gets `level6.stepTypical` until this ticket gives it entries.
