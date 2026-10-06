# 19: Code editor, file upload and the 20-line limit

**What to build:** The learner writes their Program in a proper code editor, or uploads a file, and the app holds it to the v1 limits with clear messages.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

**Needs a human for:** typing in the editor on a real phone.

- [ ] CodeMirror 6 replaces the skeleton's text box, and works on phones. Done, and the 390px-frame tests in Playwright type in it; the real-phone check is still to do.
- [x] File upload loads a `.py` file into the editor. It doesn't Run by itself. Its name replaces `program.py` in the Try it yourself commands (ticket 06); the schema allows only letters, digits, `_`, `.` and `-` in it, so a name with spaces or quotes needs a rule.
- [x] Any Python feature is allowed. Over 20 lines, a clear message appears and Run stays off until the Program fits.
- [x] Importing a package outside the standard library gives a friendly message explaining that only the standard library is available.
- [x] Nothing is analyzed while the learner types. Editing after a Run marks the zoom view as out of date, with a prompt to Run again.

## Comments

- Ticket 11: the editor highlights the code the Selection comes from. The textarea can’t mark its own text, so `src/editor/ProgramEditor.tsx` draws a copy of the code with the mark underneath it. A code editor can mark its own text instead, and should keep the e2e hooks in `e2e/selection.spec.ts` (`.editor-highlight`, `data-line`) or update them. The highlight goes away once the code is edited after Run.
- Ticket 16: the Examples are a row of buttons above the editor (`src/examples/ExamplePicker.tsx`). Picking one puts its code in the editor. `App.tsx` keeps the code each Analysis describes (`shown.code`): an Example's button stays pressed, and the highlight shows, only while the editor holds that code. The e2e tests find the editor by role (`getByRole('textbox', { name: 'Your program' })`).
- Ticket 17: the editor also marks the code a syntax error points at, as a `mark` with `data-error`, while the code is unedited. A code editor should keep that mark, or update `e2e/examples.spec.ts` and `e2e/syntax-tree.spec.ts`.

Built in `app/`. Decisions made along the way:

- The editor is CodeMirror 6 (`src/editor/ProgramEditor.tsx`), with Python's colors from the token design tokens and line numbers. Enter indents after a colon, by 4 spaces. About 13 lines show at once; a longer Program scrolls.
- Tab isn't bound: it moves focus on, so nobody using the keyboard is trapped in the editor, and the keyboard test still tabs past it to the depth gauge. Ctrl+] and Ctrl+[ indent and dedent a line.
- The editor marks its own text, so the copy underneath from ticket 11 is gone. The marks are CodeMirror's `outerDecorations`, so a mark stays one element across the code's colors; a marked newline is a ↵ at the end of its line. The test hooks stay: `.editor-highlight`, `data-line` on each line with a mark, and `data-error` on a syntax error's mark. `toHaveValue` works only on form fields, so the e2e tests read the editor's code with `editorCode()` in `e2e/helpers.ts`, and the scrolling test measures CodeMirror's scrolling box.
- "Your program" names the editor through `aria-labelledby`, so the tests still find it by role. The editor's text also has `tabindex="0"`: without it, axe doesn't count the scrolling box as holding anything focusable.
- An "Upload a .py file" button opens the file picker. The file goes into the editor and waits for Run. Windows line endings become plain newlines, and one newline at the end is dropped, as for the Examples. Picking an Example goes back to `program.py`.
- `fileNameFor` in `src/editor/limits.ts` makes the name safe to type: accents come off, any other run of characters outside letters, digits, `_`, `.` and `-` becomes one `_`, a leading `-` or `.` goes (so `python -v.py` can't read as an option), the name is cut to 40 characters, and it always ends in `.py`. A name with nothing left becomes `program.py`. When the name changes, the note under Run says what the commands call it.
- Not handled: a file named after a module a command uses, such as `tokenize.py` or `dis.py`. At home, `python -m tokenize tokenize.py` would run the learner's own file. In the browser, the analyzer runs every command in one Python, where those modules are already imported, so the page shows tokenize's output.
- The 20 lines are the Program's lines: blank lines count, and a newline at the end of the last line doesn't start another. Over the limit, a note under Run says how many lines to take out, and Run is off.
- The error Fact gains `module` and `standardLibrary` when Python's own ModuleNotFoundError stops the Program: the module it looked for, and whether its top-level name is in `sys.stdlib_module_names`. Outside the standard library, a note under Run says the Program stopped there and that only the standard library is available. A standard-library module the browser's Python lacks, such as `tkinter` or `turtle`, gets no note, only the Terminal's traceback.
- While the code differs from what the zoom view shows, also after editing an Example, a note at the top of the zoom view says so and asks for a Run.
