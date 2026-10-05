# 21: Share links

**What to build:** A learner can share a link that carries their program. Whoever opens it sees the code and chooses whether to run it.

**Blocked by:** 19: Code editor, file upload and the 20-line limit

**Status:** ready-for-agent

- [ ] The program is compressed into the URL fragment (`#...`). No server and no storage are involved (ADR 0004).
- [ ] A Share link opens with the code visible and a Run button, and never runs by itself.
- [ ] A 20-line Program round-trips exactly.

## Comments

- Ticket 16: the page starts by showing hello world's Analysis, made when the site was built, with its code in the editor. A Share link puts its own code in the editor instead, so it shouldn't also show hello world's Analysis as if it were that code's.
