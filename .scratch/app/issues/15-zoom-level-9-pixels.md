# 15: Zoom level 9: Pixels

**What to build:** A learner picks a line of their real output, then a character in it, and sees it drawn by the browser, enlarged until each pixel is a square, with the font outline on top. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 07: Your program runs: real output and Events; 11: Selecting anything highlights related Facts at every level

**Status:** ready-for-agent

- [ ] The characters come from the real stdout.
- [ ] The glyph is rendered live by the browser and enlarged into a pixel grid, with anti-aliasing visible and the outline drawn over it.
- [ ] A space gets its own note: it lights no pixels.
- [ ] Screen facts use the learner's own device, for example its resolution.
- [ ] Labeled Typical.

## Comments

- Ticket 11: `src/zoom/selection.ts` links each zoom level to the others through Fact IDs. Level 9 shows the step run closest to the Selection until this ticket gives it its lines of output: add its Facts to `FACTS` and replace its entry in `LINKS`. The `Anchor` of a step run carries the run, so the entry can find the line it printed.
- Ticket 14: the lines of output are Facts, `out-0` and on, from `outputLines` in `src/explain/output.ts`: each with its door (1 for stdout, 2 for a traceback on stderr), its text without color codes, and the step run that wrote its last piece. `closestLine` finds the line a step run printed. Level 8's elements are a line at one stage, `out-N-S`; level 9's can be a line and a character in it. `FACTS.out` anchors `out-N` and `out-N-S` to the step run that wrote the line; level 9's IDs need a pattern of their own there.
