# 08: Zoom level 3: Tokens

**What to build:** A learner sees their Program broken into tokens, laid over the source as chips, and can pick any token to learn what it is, where it sits and which bytes make it up. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes; 03: Explanations come from Templates filled with Facts; 04: Honesty labels and Concept cards; 05: Machine map; 06: Try it yourself

**Status:** ready-for-agent

- [ ] `analyze()` returns tokens from `tokenize`, each a Fact (`tok-N`) with its span. For hello world: NAME `print`, OP `(`, STRING, OP `)`, NEWLINE, ENDMARKER.
- [ ] For a multi-line Program, chips cover every line, including the NEWLINE, NL, INDENT and DEDENT tokens that mark line ends and indentation.
- [ ] Token chips sit over the source, and picking one explains it, including its position in `tokenize`'s own `1,0-1,5` notation and its bytes.
- [ ] Labeled Observed.
- [ ] The machine map lights RAM: the Program, now read as tokens. The app never saves the Program to the disk, so the note doesn't say it was copied from there (ticket 05).
- [ ] Try it yourself: `python -m tokenize` on the learner's file: captured output for the Examples, live output for the learner's own program (ticket 06). The analyzer can do what `python FILE` and `python -c` do so far; this ticket adds `python -m`.
