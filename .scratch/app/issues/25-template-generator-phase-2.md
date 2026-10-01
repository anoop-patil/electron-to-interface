# 25: Template generator (Phase 2)

**What to build:** Every element Python 3.14.2 can produce has a rich, plain-English Template, written with Claude offline at build time and shipped as static files. No learner action ever calls Claude.

**Blocked by:** 03: Explanations come from Templates filled with Facts; 08: Zoom level 3: Tokens; 09: Zoom level 4: Syntax tree; 10: Zoom level 5: Bytecode and plates

**Status:** ready-for-agent

**Needs a human for:** adding the Anthropic API key to GitHub Actions secrets, on prepaid credit with auto-reload off.

- [ ] A Python script uses the Claude Batch API, with the most capable Claude model at generation time, to write Templates for every token type, syntax-tree node type and opname, including specialized variants. It also writes "Why?" and "Go deeper" text per element type.
- [ ] Every output validates against the JSON Schema, and any reference to a missing Fact fails the build.
- [ ] It runs only on manual trigger or when its inputs change, never on pull requests from forks. Outputs are committed, so a normal deploy never calls Claude.
- [ ] CI fails if any opname, node type or token type in the pinned version has no Template.
- [ ] Hand-written Templates from earlier tickets aren't silently overwritten.

## Comments

- Ticket 10 wrote level 5's Templates by hand: `step.*` for about 80 opnames and variants, `level5.*` for the page and `map.level5.*` for the Machine map. They aren't to be overwritten silently.
