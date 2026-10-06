# 17: Syntax errors explained

**What to build:** A learner whose code has a syntax error sees the zoom levels that still make sense, as far as Python got, and a plain-English explanation of what went wrong.

**Blocked by:** 08: Zoom level 3: Tokens; 16: Examples load instantly from build-time Analyses

**Status:** ready-for-agent

- [x] A syntax-error Example is added to the Examples.
- [x] Levels 1 to 3 show as far as they get. Later levels say plainly why they're unavailable.
- [x] The error is explained in plain English, pointing at the exact place in the code.

## Comments

- Ticket 09: a Program with a syntax error has no syntax tree. Level 4 says so in one sentence, `level4.noTree`, and points to the Terminal, which shows Python's traceback. This ticket can replace that sentence with the plain-English explanation.
- Ticket 16: add the syntax-error Example to `EXAMPLES` in `src/examples/examples.ts`; the build then makes its Analysis. `src/examples/build.test.ts` checks that every Example runs to the end and prints, so it needs an exception for this one. An Example's Analysis carries `example`, and Templates that would say the browser just ran it have an Example variant: check any new text for a Program with an error, such as `tryIt.level1.error`, against both.

Built in `app/`. Decisions made along the way:

- The user chose the Example: `app/examples/syntax.py`, ID `syntax`, button "syntax error". Line 3, `print("Hello, name)`, never closes its text, so `tokenize` stops at the `(` before it and the tokens stop short. `build.test.ts` checks every other Example runs to the end, and this one stops there.
- The error Fact gains `start` and `end`: the code Python points at, as `tokenize` counts positions (characters, from column 0). `end` is left out where Python names none after the start. A SyntaxError the Program raises as it runs, from `eval("1 +")` for example, is an ordinary error, placed on the Program's line that ran it.
- A Program has a syntax error if Python made no steps from it (`src/explain/stopped.ts`). Where Python stopped is worked out from what the zoom levels show: level 3 if the tokens don't reach the end marker, level 4 if there is no syntax tree, else level 5 (`'return' outside function`, for example). `tokenize` is lenient: it reads `“hi”` as a name, so an invalid character stops at level 4, where `ast.parse` fails.
- The user chose where the explanation shows: at level 1, and again at the level where Python stopped, with the line Python points at. The place is marked in the code at level 1 and in the editor, in the warning color, while the code is unedited. Later levels up to 7 say why they're empty in one sentence each; 6 and 7 are labeled Observed then. Levels 8 and 9 follow the traceback, with Templates that say Python never ran the Program.
- `src/explain/syntaxError.ts` picks a Template by Python's message: 15 common ones, such as a missing colon, a bracket never closed, a curly quote mark or an unexpected indent, and `syntaxError.general`, which quotes Python's message, for any other. Python's message also shows in small print.
- Level 5's introduction, level 1's for an Example, and the Try it yourself notes have syntax-error variants, since the usual ones say Python ran the Program. A command that couldn't read the Program says so in place of its reading notes.
