# 02: Zoom shell: depth gauge, navigation, URLs and themes

**What to build:** A learner can move through all nine zoom levels with the depth gauge, the Zoom in / Back buttons, the arrow keys and the address bar, in the calm look of prototype v8. Levels without their own ticket yet show a plain placeholder.

**Blocked by:** 01: Walking skeleton: your program's bytes, in the browser

**Status:** ready-for-agent

- [ ] A depth gauge with 9 ticks lights the current zoom level and doubles as navigation. It shows a labeled break for the Interpreter handoff between levels 5 and 6. On phones it becomes a horizontal strip at the top.
- [ ] Moving deeper is always an explicit Zoom in button (or the down arrow), never a second click on an element.
- [ ] Each zoom level has its own URL path (`/zoom/1` to `/zoom/9`). Back, forward and deep links all work.
- [ ] The zoom animation takes about 250 ms. With reduced motion on, it's a plain crossfade. There are no other animations.
- [ ] Light and dark themes are each designed properly from CSS-variable design tokens. The page follows the system setting and has a manual toggle. Warm-gray neutrals, one accent color, and a subtle warm-to-cool tint that shifts with depth.
- [ ] IBM Plex Sans and Plex Mono are self-hosted as WOFF2, two weights each, with no third-party font requests.
- [ ] Desktop: editor on the left, zoom view on the right. Phone: code on top, collapsible to one line.
- [ ] No horizontal page scroll at 390px wide on any level. Headless browsers won't lay a page out narrower than about 490px, so test at a true 390px (for example inside a 390px-wide frame) and on a real phone.
- [ ] All text meets WCAG AA in both themes, everything works from the keyboard, and focus rings are visible. An automated accessibility check runs in Playwright.
