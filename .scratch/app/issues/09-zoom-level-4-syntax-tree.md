# 09: Zoom level 4: Syntax tree

**What to build:** A learner sees the structure Python found in their code, as boxes inside boxes, and can pick any box to learn its role. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes; 03: Explanations come from Templates filled with Facts; 04: Honesty labels and Concept cards; 05: Machine map; 06: Try it yourself

**Status:** ready-for-agent

- [x] `analyze()` returns the syntax tree from `ast`, each node a Fact (`ast-N`) with its span. For hello world: Module → Expr → Call(Name `print`, Constant).
- [x] For a multi-line Program, the whole Program's tree is shown, with each function's or loop's body nested inside it.
- [x] A tree diagram on desktop, and an indented outline on phones.
- [x] Labeled Observed.
- [x] Try it yourself: `python -m ast` on the learner's file: captured output for the Examples, live output for the learner's own program (ticket 06).

## Comments

Built in `app/`. Decisions made along the way:

- The tree comes from `ast.parse` on the Program's bytes, as Python does when it runs a file. The nodes are listed in the order `python -m ast` prints them: a node, then the nodes in each of its fields, in turn. So `ast-0` is the Module, as Requirements numbers Fact IDs from 0. (v8 started at 1.)
- Each node records its parent, the field of the parent that holds it, its span in bytes, and its fields in Python's order. A field holds either other nodes or a value, written as `python -m ast` writes it: `'print'`, `Load()`, `1`. Fields that `python -m ast` leaves out, an empty list or None where None is the default, are left out here too.
- Markers such as `Load`, `Store` and `Add` are values of the node around them, not nodes of their own, as in v8: they have no fields and no place in the code.
- ast counts columns in the UTF-8 bytes of the text it decoded. The analyzer turns them into byte positions in the Program, so a Program with a coding comment such as `# coding: latin-1` still gets the right bytes. A node with no place in the code, such as the Module or `arguments`, has no span. (v8 gave it the whole file.)
- A Program with a syntax error has no tree. Level 4 says so and points to the Terminal; ticket 17 explains the error.
- One long line can nest deep: `1+1+…+1` with 1,200 terms nests 1,200 BinOps. The analyzer walks the tree with a stack, not by calling itself, and empties each node before letting the tree go, because freeing a deep tree in one go overflows the browser's stack and stops Pyodide for good. 1,200 terms now works in Chromium. 3,000 terms stopped Pyodide before this ticket too, so it is left to ticket 18.
- Chrome stops the page when boxes nest much deeper than about 30, so the page draws 24 levels of boxes. A box at the 24th level that holds more says how many: "Not drawn: the 2356 boxes inside this one. Your program’s tree is too deep to draw in full." The boxes use flex: nested grids, and nested inline-blocks aligned to the top, made Chrome's layout time double with every level.
- Desktop shows v8's boxes inside boxes. A name, a fixed value or an input is drawn as its text, with its plain name under it; a box with statements lists its fields one under another; a box with a name of its own shows it, as in v8's "Define a function: greet". Phones (up to 920px, the app's `narrow` width) get an indented outline instead. Both are nested lists, so screen readers hear the nesting.
- The text is in Templates, by kind of node (`node.*`), with the plain names of roles (`role.*`, such as What to call) and of fields (`field.*`, such as what to give it). A field with no words of its own shows the name Python gives it, such as `decorator_list`.
- Changes from prototype v8's wording, to make it true for every Program:
  - The Module is "Your program", not "Your file", because the app never saves a file. Its text counts the statements rather than naming them.
  - v8's field label "its steps" is "its statements": CONTEXT.md keeps Step for bytecode.
  - FunctionDef, For, arg and List count what they hold. arg has two Templates: the one input a function takes, and one of several. A Name being stored gets "each trip round the loop" only as a For's target.
  - "selecting it highlights nothing" is gone from `arguments`, since no level highlights another's Selection yet (ticket 11). v8's List sentence about the compiler storing it as something simpler is gone, since that is true only of some lists.
  - v8's panel "Where did the brackets, colons and indentation go?" names only the signposts the Program has: brackets, the colons and indentation of indented blocks, or both. A Program with neither, such as `x = 1`, has no panel.
  - New Templates for Assign, BinOp, If, Return and Attribute, common in short programs, and a general one for any other node (ticket 18).
- The How to read it rows are worked out from the Program: the first box of each kind the tab explains (Module, FunctionDef, arg, Expr, Call, a Name that is read, a Constant, For, a Name that is stored), each as `python -m ast` starts it, with the boxes inside shortened: `Call(func=…, args=[…])`. v8's single `ctx=Store() / ctx=Load()` row became the two Name rows. A new note says that each name followed by brackets in the output is a box, except `Load()`, `Store()`, `Del()` and operators such as `Add()`. When `python -m ast` stops with an error, the tab shows no rows and no notes.
- The Structure (syntax tree) Concept card is ported from v8, related to Token and Your steps. The Token card now lists it as related, as v8's did.
- The Machine map note is "your program · as 5 boxes, temporary", in RAM, after v8's "the boxes: 18 of them, temporary".
- As in ticket 08, a test runs greet.py in Pyodide and confirms its tree and its `python -m ast` output match v8's capture.
- Level 4 has no Selection until the learner picks a box. A selected box isn't highlighted at other levels yet: that is ticket 11.
