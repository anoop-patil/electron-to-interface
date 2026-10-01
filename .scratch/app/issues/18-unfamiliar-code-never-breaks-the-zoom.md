# 18: Unfamiliar code never breaks the zoom

**What to build:** Any Program within the limits (20 lines, any Python feature) can be zoomed through every level. Elements that don't have their own Template yet get a sensible generic Explanation instead of a crash.

**Blocked by:** 03: Explanations come from Templates filled with Facts; 09: Zoom level 4: Syntax tree; 10: Zoom level 5: Bytecode and plates

**Status:** ready-for-agent

- [ ] Any token type, syntax-tree node type or opname without a Template falls back to a generic Explanation, plus a link to the official Python docs.
- [ ] A test program set covering unusual constructs, from decorators and `match` statements to generators and `try`/`except`, zooms through every available level without an error.

## Comments

- Ticket 08 gave level 3 a general Template, `token.other`, for any token type without its own. It has no link to Python's docs yet.
