# 09: Zoom level 4: Syntax tree

**What to build:** A learner sees the structure Python found in their code, as boxes inside boxes, and can pick any box to learn its role. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes; 03: Explanations come from Templates filled with Facts; 04: Honesty labels and Concept cards; 05: Machine map; 06: Try it yourself

**Status:** ready-for-agent

- [ ] `analyze()` returns the syntax tree from `ast`, each node a Fact (`ast-N`) with its span. For hello world: Module → Expr → Call(Name `print`, Constant).
- [ ] For a multi-line Program, the whole Program's tree is shown, with each function's or loop's body nested inside it.
- [ ] A tree diagram on desktop, and an indented outline on phones.
- [ ] Labeled Observed.
- [ ] Try it yourself: `python -m ast` on the learner's file: captured output for the Examples, live output for the learner's own program (ticket 06).
