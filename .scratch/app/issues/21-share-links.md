# 21: Share links

**What to build:** A learner can share a link that carries their program. Whoever opens it sees the code and chooses whether to run it.

**Blocked by:** 19: Code editor, file upload and the 20-line limit

**Status:** ready-for-agent

- [ ] The program is compressed into the URL fragment (`#...`). No server and no storage are involved (ADR 0004).
- [ ] A Share link opens with the code visible and a Run button, and never runs by itself.
- [ ] A 20-line Program round-trips exactly.
