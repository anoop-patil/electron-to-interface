# 32: Tailwind styling

**What to build:** The app's styles move from plain CSS to Tailwind, reading the same design tokens from CSS variables (Requirements: Technology). Nothing a learner sees changes. Best done before the other UI tickets (04, 05, 06 and 19), so their styles are written in Tailwind from the start.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [x] Tailwind runs in the Vite build. Its theme reads the colors, tints and fonts from the existing CSS variables, so one swap of variables still switches between light and dark.
- [x] Components are styled with Tailwind. `styles.css` keeps only the design tokens and anything Tailwind can't express, and `fonts.css` keeps the font faces.
- [x] Nothing changes on screen: every Playwright test passes unchanged, including the accessibility check in both themes and the 390px layout.
- [x] No transitions or animations are added. The zoom stays the only animation.

## Comments

Built in `app/` with Tailwind 4.3.3 and its Vite plugin. Decisions made along the way:

- Tailwind's theme holds only our tokens: its default colors and fonts are cleared, so a class like `bg-red-500` doesn't exist.
- `mid:` (up to 1180px) and `narrow:` (up to 920px) are custom variants with the old `max-width` queries. Tailwind's own `max-*` variants exclude the width itself, so at exactly 920px they would have shown a different layout.
- Hover styles use plain `:hover`, as before. Tailwind's default only applies hover where the device supports it.
- Tailwind's base styles set a tab size of 4 everywhere. The page keeps the browser's 8 (a class on `<html>`), because Python reads a tab as reaching the next multiple of 8 columns, and the editor keeps 4, as before.
- The body sets only `-webkit-font-smoothing`, as before. Tailwind's `antialiased` would also change text in Firefox on macOS.
- The selected byte and the highlighted character use a plain `box-shadow`, not Tailwind's `ring`, which shaded their rounded corners a few pixels differently.
- `src/button.ts` gives every button its classes, plain or primary, in one of four sizes. It replaces `.btn`.
- `styles.css` keeps the tokens, the theme, the custom variants and one global rule: the focus ring on every focusable element.
- `<main>` keeps the class `stage` only because a Playwright test finds the zoom view by it.
- Checked by comparing the old and new builds in Chromium: 122 full-page screenshots (both themes; 1400, 1181, 1180, 1000, 921, 920 and 700px wide; the 390px frame; hover, focus, selection and Python-failed states) matched, and a computed-style dump of every element differed only where nothing shows. Other browsers weren't compared.
