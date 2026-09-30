# 02: Zoom shell: depth gauge, navigation, URLs and themes

**What to build:** A learner can move through all nine zoom levels with the depth gauge, the Zoom in / Back buttons, the arrow keys and the address bar, in the calm look of prototype v8. Levels without their own ticket yet show a plain placeholder.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser

**Status:** ready-for-agent

**Needs a human for:** checking on a real phone that no zoom level scrolls sideways at 390px wide.

- [x] A depth gauge with 9 ticks lights the current zoom level and doubles as navigation. It shows a labeled break for the Interpreter handoff between levels 5 and 6. On phones it becomes a horizontal strip at the top.
- [x] Moving deeper is always an explicit Zoom in button (or the down arrow), never a second click on an element.
- [x] Each zoom level has its own URL path (`/zoom/1` to `/zoom/9`). Back, forward and deep links all work.
- [x] The zoom animation takes about 250 ms. With reduced motion on, it's a plain crossfade. There are no other animations.
- [x] Light and dark themes are each designed properly from CSS-variable design tokens. The page follows the system setting and has a manual toggle. Warm-gray neutrals, one accent color, and a subtle warm-to-cool tint that shifts with depth.
- [x] IBM Plex Sans and Plex Mono are self-hosted as WOFF2, two weights each, with no third-party font requests.
- [x] Desktop: editor on the left, zoom view on the right. Phone: code on top, collapsible to one line.
- [ ] No horizontal page scroll at 390px wide on any level. Headless browsers won't lay a page out narrower than about 490px, so test at a true 390px (for example inside a 390px-wide frame) and on a real phone. Done in a 390px frame in Playwright; the real-phone check is still to do.
- [x] All text meets WCAG AA in both themes, everything works from the keyboard, and focus rings are visible. An automated accessibility check runs in Playwright.

## Comments

Built in `app/`. Decisions made along the way:

- Styling is still plain CSS, reading prototype v8's design tokens from CSS variables. Tailwind, which Requirements lists, comes in ticket 32.
- The fonts are the Latin subset of IBM Plex Sans and Mono, weights 400 and 600, from the pinned `@fontsource` packages. Vite bundles them into the site. Characters outside the subset fall back to system fonts. Their license is in `licenses/IBM-Plex-LICENSE.txt`.
- Any other address, including `/`, opens zoom level 1 and shows `/zoom/1`. The query and fragment are kept, because Share links (ticket 21) carry the program in the fragment.
- A second zoom before the first has finished replaces its history entry, so Back never lands on a level the learner didn't see.
- The zoom is 100 ms out and 150 ms in, growing from the selected element if there is one.
- The ↓ and ↑ keys zoom whenever focus isn't in a text field, so they don't scroll the page, as in prototype v8.
- The theme toggle's choice is saved in the browser and overrides the system setting from then on.
- Run keeps the learner on the zoom level they're on. The selected byte stays selected across levels, so zooming back to level 1 shows its character highlighted.
- Below 920px wide, the gauge strip scrolls sideways inside itself and keeps the current tick in view.
- Levels 3 to 9 say "This zoom level isn't built yet."
