# 32: Tailwind styling

**What to build:** The app's styles move from plain CSS to Tailwind, reading the same design tokens from CSS variables (Requirements: Technology). Nothing a learner sees changes. Best done before the other UI tickets (04, 05, 06 and 19), so their styles are written in Tailwind from the start.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [ ] Tailwind runs in the Vite build. Its theme reads the colors, tints and fonts from the existing CSS variables, so one swap of variables still switches between light and dark.
- [ ] Components are styled with Tailwind. `styles.css` keeps only the design tokens and anything Tailwind can't express, and `fonts.css` keeps the font faces.
- [ ] Nothing changes on screen: every Playwright test passes unchanged, including the accessibility check in both themes and the 390px layout.
- [ ] No transitions or animations are added. The zoom stays the only animation.
