# 15: Zoom level 9: Pixels

**What to build:** A learner picks a line of their real output, then a character in it, and sees it drawn by the browser, enlarged until each pixel is a square, with the font outline on top. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 07: Your program runs: real output and Events; 11: Selecting anything highlights related Facts at every level

**Status:** ready-for-agent

- [x] The characters come from the real stdout.
- [x] The glyph is rendered live by the browser and enlarged into a pixel grid, with anti-aliasing visible and the outline drawn over it.
- [x] A space gets its own note: it lights no pixels.
- [x] Screen facts use the learner's own device, for example its resolution.
- [x] Labeled Typical.

## Comments

- Ticket 11: `src/zoom/selection.ts` links each zoom level to the others through Fact IDs. Level 9 shows the step run closest to the Selection until this ticket gives it its lines of output: add its Facts to `FACTS` and replace its entry in `LINKS`. The `Anchor` of a step run carries the run, so the entry can find the line it printed.
- Ticket 14: the lines of output are Facts, `out-0` and on, from `outputLines` in `src/explain/output.ts`: each with its door (1 for stdout, 2 for a traceback on stderr), its text without color codes, and the step run that wrote its last piece. `closestLine` finds the line a step run printed. Level 8's elements are a line at one stage, `out-N-S`; level 9's can be a line and a character in it. `FACTS.out` anchors `out-N` and `out-N-S` to the step run that wrote the line; level 9's IDs need a pattern of their own there.

Built in `app/`. Decisions made along the way:

- The user chose to draw the same lines as level 8, on both doors: a traceback's lines too. A traceback line is drawn in the page's ink, with a note that a terminal colors it.
- The user chose Typical for the whole level. Prototype v8 labeled the grid and the screen's size Observed, but in the app Observed means Python recorded it, and the browser draws the grid. So the grid and the screen facts carry no chip of their own; their text says the browser drew the character just now, and that the screen's size comes from what the browser reports.
- The user chose real device pixels: the line is drawn at the screen's device pixel ratio, so each square is one of the screen's pixels, not one CSS pixel as in v8.
- Level 9's elements are `px-N-C`, character C of line N. Characters are what a reader counts (`Intl.Segmenter` graphemes), so é and 👍🏽 are one each. An empty line's only element is `px-N-0`, and level 9 says the line is empty. From another level, level 9 picks the first character that isn't a space.
- A line picked at level 8 or 9 stays picked between them: an `Anchor` now carries the line, so a step run that printed two lines, as `print("a\nb")` does, no longer jumps back to the first.
- The grid counts a pixel as fully lit only at full ink (255), partly lit from 1 to 254. v8 counted 200 and up as fully lit. The selected character is drawn on its own, in its place, for the grid and the counts, so a neighbour's edge never counts as its own, and a space always counts 0.
- The screen's size is the size the browser reports times its device pixel ratio, as in v8. In Chrome, page zoom changes the ratio but not the size, so the text says the number comes from what the browser reports, and changes if the page is zoomed.
- The counts sit beside the grid rather than in the Explanation, as v8 had them, since the Explanation comes from Templates before the browser draws.
- A long line shows its characters 40 at a time, with Earlier and Later. Level 8's line picker moved to `LinePicker.tsx`, which both levels use.
- Try it yourself has no command at level 9: the schema's `TryIt` takes a `summary` instead, and the build fails unless a level has a command, or a summary and no parts or reading notes.
- Cards `pixel`, `font` and `aa` join the Concepts index. The `screen` card shows the learner's screen size.
