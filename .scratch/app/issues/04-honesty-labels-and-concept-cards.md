# 04: Honesty labels and Concept cards

**What to build:** Every zoom level says how it knows what it shows, and highlighted words open short, self-contained Concept cards inside the app. Both are in place for levels 1 and 2, ready for later levels to add their own.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [ ] Each zoom level, and any panel whose provenance differs from its level, carries exactly one Honesty label as a text chip. Only Illustrative gets a warning color, and labels are never encoded as border styles (ADR 0005).
- [ ] Every chip opens the "How we know" Concept card, which defines all the labels.
- [ ] The label set is data, not hardcoded in components. The user hasn't yet decided whether to keep five labels or merge them into three, so changing the set must be a data edit.
- [ ] Words with a Concept card are highlighted in the text. Opening one shows its name, a one-line analogy, the explanation and related cards, all inside the app. Nothing links out for explanations.
- [ ] A Concepts index, grouped as in prototype v8, is reachable from the header.
- [ ] The cards used by levels 1 and 2 (bit, byte, binary, UTF-8, encoding and decoding, newline) are ported from prototype v8.
- [ ] Level 1's introduction ends with prototype v8's sentence "Highlighted words, like that one, open a short explanation.", added to its Template once the words open cards.
- [ ] Level 2 shows prototype v8's panel "How the number N is stored" for the selected byte: its 8 bits, each with its value, labeled Derived, with its text from Templates.
- [ ] Cards open and close from the keyboard, and Escape closes them.
