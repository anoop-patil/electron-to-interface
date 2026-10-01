# 04: Honesty labels and Concept cards

**What to build:** Every zoom level says how it knows what it shows, and highlighted words open short, self-contained Concept cards inside the app. Both are in place for levels 1 and 2, ready for later levels to add their own.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [x] Each zoom level, and any panel whose provenance differs from its level, carries exactly one Honesty label as a text chip. Only Illustrative gets a warning color, and labels are never encoded as border styles (ADR 0005).
- [x] Every chip opens the "How we know" Concept card, which defines all the labels.
- [x] The label set is data, not hardcoded in components. The user hasn't yet decided whether to keep five labels or merge them into three, so changing the set must be a data edit.
- [x] Words with a Concept card are highlighted in the text. Opening one shows its name, a one-line analogy, the explanation and related cards, all inside the app. Nothing links out for explanations.
- [x] A Concepts index, grouped as in prototype v8, is reachable from the header.
- [x] The cards used by levels 1 and 2 (bit, byte, binary, UTF-8, encoding and decoding, newline) are ported from prototype v8.
- [x] Level 1's introduction ends with prototype v8's sentence "Highlighted words, like that one, open a short explanation.", added to its Template once the words open cards.
- [x] Level 2 shows prototype v8's panel "How the number N is stored" for the selected byte: its 8 bits, each with its value, labeled Derived, with its text from Templates.
- [x] Cards open and close from the keyboard, and Escape closes them.

## Comments

Built in `app/`. Decisions made along the way:

- The cards and the Concepts index are in `app/concepts/cards.json`. The label set is in `app/concepts/honesty-labels.json`, with the label each zoom level and panel carries, so a three-label set is an edit to that file alone. The JSON Schema covers both.
- The build check (`app/src/explain/checkContent.ts`, which replaces `checkTemplates.ts`) fails if any text opens a card that doesn't exist, a related card or index entry doesn't exist, a card isn't in the index exactly once, no card shows the labels, a zoom level or panel carries a label not in the set, or more than one label has the warning color.
- Only zoom levels 1 and 2 carry a label: a level that isn't built yet shows nothing to label. A level's chip appears once a Program has run.
- Cards open in the browser's own modal `<dialog>`, which gives Escape and focus handling, instead of shadcn/ui's dialog; Requirements.md now says so. Focus returns to whatever opened the card. The arrow keys don't zoom while a card is open, and a click outside the card closes it.
- Changes from prototype v8's wording:
  - Level 1's introduction: v8's sentence about the file on the disk is gone (the app has no file), so "Your computer stores it as bytes, which the next zoom level shows." comes before "Highlighted words, like that one, open a short explanation.", to give "that one" a highlighted word.
  - The panel's last sentence drops "on the disk, and later in RAM". A byte of a longer character says which byte it is ("So the second byte of ë is stored as…").
  - Bit: "In RAM, or on an SSD" instead of "On a disk or in RAM", since a hard disk stores bits magnetically.
  - UTF-8: "A computer can only store numbers" instead of "A disk".
  - Newline: v8's "your file might be 93 bytes instead of 94" became "Some editors don't add one after the last line. This app always does".
  - How we know: it doesn't count the labels or list their meanings, so a different set needs no card edit, and it has no related cards until the token and bytecode cards exist. Observed's meaning points to the header for the Python version instead of naming it.
  - The UTF-8 table's bytes are worked out by the page from the characters, not typed in.
