# 03: Explanations come from Templates filled with Facts

**What to build:** The explanations on zoom levels 1 and 2 are Templates filled in with the learner's real Facts, so the same text works for any program. Later levels and the Phase 2 generator build on this format.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser

**Status:** ready-for-agent

- [ ] Templates live in a versioned data file per Python version (for example `py314`), in one plain-English voice. The technical term appears once, in small print. There is no audience toggle.
- [ ] The Template format is part of the JSON Schema. A Template's slots refer to Facts, and filling one in produces an Explanation.
- [ ] The build fails if a Template refers to a Fact that doesn't exist, and a test proves it.
- [ ] Level 1 and level 2 text (for example, "Every character has an agreed number. p is 112...") comes from Templates, matching prototype v8's wording.
- [ ] A test with a multi-line Program shows the Explanation's values change with the Facts.
