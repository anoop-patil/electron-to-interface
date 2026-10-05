# 19: Code editor, file upload and the 20-line limit

**What to build:** The learner writes their Program in a proper code editor, or uploads a file, and the app holds it to the v1 limits with clear messages.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [ ] CodeMirror 6 replaces the skeleton's text box, and works on phones.
- [ ] File upload loads a `.py` file into the editor. It doesn't Run by itself. Its name replaces `program.py` in the Try it yourself commands (ticket 06); the schema allows only letters, digits, `_`, `.` and `-` in it, so a name with spaces or quotes needs a rule.
- [ ] Any Python feature is allowed. Over 20 lines, a clear message appears and Run stays off until the Program fits.
- [ ] Importing a package outside the standard library gives a friendly message explaining that only the standard library is available.
- [ ] Nothing is analyzed while the learner types. Editing after a Run marks the zoom view as out of date, with a prompt to Run again.

## Comments

- Ticket 11: the editor highlights the code the Selection comes from. The textarea can’t mark its own text, so `src/editor/ProgramEditor.tsx` draws a copy of the code with the mark underneath it. A code editor can mark its own text instead, and should keep the e2e hooks in `e2e/selection.spec.ts` (`.editor-highlight`, `data-line`) or update them. The highlight goes away once the code is edited after Run.
