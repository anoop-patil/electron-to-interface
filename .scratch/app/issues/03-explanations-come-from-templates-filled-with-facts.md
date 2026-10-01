# 03: Explanations come from Templates filled with Facts

**What to build:** The explanations on zoom levels 1 and 2 are Templates filled in with the learner's real Facts, so the same text works for any program. Later levels and the Phase 2 generator build on this format.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser

**Status:** ready-for-agent

- [x] Templates live in a versioned data file per Python version (for example `py314`), in one plain-English voice. The technical term appears once, in small print. There is no audience toggle.
- [x] The Template format is part of the JSON Schema. A Template's slots refer to Facts, and filling one in produces an Explanation.
- [x] The build fails if a Template refers to a Fact that doesn't exist, and a test proves it.
- [x] Level 1 and level 2 text (for example, "Every character has an agreed number. p is 112...") comes from Templates, matching prototype v8's wording.
- [x] A test with a multi-line Program shows the Explanation's values change with the Facts.

## Comments

Built in `app/`. Decisions made along the way:

- The Templates are in `app/templates/py314.json`. Each has a subject (`program` or `byte`), a `text`, and optionally a `title` and a `term`. The schema lists the slots each subject offers (`ProgramSlot`, `ByteSlot`), so the generated types and the build check share one list.
- In a Template's strings, `{slot}` is a Fact value, `**words**` are bold, and `[[concept|words]]` are words with a Concept card. Those words show as plain text until ticket 04.
- A Vite plugin checks every Template file when a build starts. It fails on a schema error, a slot its subject doesn't have, a malformed slot such as `{ value }`, or a `**` with no closing `**`. Playwright builds the site, so CI fails too.
- The term in small print is the character's code point, such as `code point U+0070`. On a newline it is `line feed (LF), code point U+000A`.
- Changes from prototype v8's wording: the text doesn't say the program was saved on a disk, because in the browser it never is; it has no file name, because the app has none; counts say "1 line" or "5 lines"; and each character becomes "a number, or a few numbers". "Click any line" and v8's line-by-line text for greet.py aren't ported, because level 1 has no line selection yet. Ticket 04 adds the sentence "Highlighted words, like that one, open a short explanation." once the Concept cards exist.
- Two Templates that v8 doesn't have: `byte.multiByte`, for a character that takes 2 to 4 bytes, and `byte.indentOneSpace`, so the text never says "1 spaces".
- v8's level 2 panel "How the number N is stored", with its 8 bits, moved to ticket 04, because it carries a Derived label.
- Known limits until the tokens exist (ticket 08): every `"` gets the quote-mark text, even inside a comment, and leading spaces inside a triple-quoted string get the indentation text. A tab gets the generic character text.
