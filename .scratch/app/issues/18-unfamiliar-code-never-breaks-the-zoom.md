# 18: Unfamiliar code never breaks the zoom

**What to build:** Any Program within the limits (20 lines, any Python feature) can be zoomed through every level. Elements that don't have their own Template yet get a sensible generic Explanation instead of a crash.

**Blocked by:** 03: Explanations come from Templates filled with Facts; 09: Zoom level 4: Syntax tree; 10: Zoom level 5: Bytecode and plates

**Status:** ready-for-agent

- [x] Any token type, syntax-tree node type or opname without a Template falls back to a generic Explanation, plus a link to the official Python docs.
- [x] A test program set covering unusual constructs, from decorators and `match` statements to generators and `try`/`except`, zooms through every available level without an error.

## Comments

Built in `app/`. Decisions made along the way:

- A general Template has a `docs` link: its words and its address, filled in like its other strings. The page shows it under the Explanation as "Read about BinOp in Python’s documentation", opening in a new tab. The schema allows only addresses in the documentation for Python 3.14, and the build checks their slots as it checks the text's. A Fact going into an address is URL-encoded.
- Where each link leads: a token type to `library/token.html#token.TYPE`, a kind of box to `library/ast.html#ast.Type`, an opname to `library/dis.html#opcode-OPNAME`, and a syntax error with no Template of its own to `library/exceptions.html#SyntaxError` (or `IndentationError`, `TabError`). On 6 October 2026, checked against the names in CPython 3.14.3, those pages had an anchor for every token type tokenize emits, every kind of box `ast.parse` makes and every opname, apart from internal ones `dis` never shows for a Program, such as the `INSTRUMENTED_` forms.
- The test program set is in `app/test-programs/`, nine Programs of up to 20 lines: decorators and a property, `match`, generators and comprehensions, `try`/`except`/`else`/`finally` and `raise`, async functions, generators and `async with`, `with`, `while`/`else`, `nonlocal`, the walrus operator, type parameters and `type`, a t-string, a Program that stops with a ZeroDivisionError, and one line of 2,500 terms.
- `src/zoom/unusualPrograms.test.ts` runs each one in Pyodide under Node.js, explains every token, box and step, and draws every zoom level for selections spread through the Program, with the Machine map and Try it yourself. Level 9 measures the screen, which only a browser has, so there it works out the view without drawing it. It also checks the set reaches the general Templates for a token, a box with a place in the code and one without, and a step. `e2e/unusual-programs.spec.ts` runs each one in Chromium, checks the page shows it with no error, and zooms from level 1 to level 9.
- `asyncio.run` fails in Pyodide: "WebAssembly stack switching not supported". So `async.py` runs its coroutine by hand, with `send(None)`.
- One long line, `print(1+1+…+1)`, works at every level in Chromium with 2,500 terms.
- Under Node.js, 3,000 terms ran out of stack in the analyzer's own work, in `python -m ast`: `ast.dump` stops with a RecursionError, and the error's traceback keeps the frame that holds the tree. Letting the error go freed the tree one node inside another. The analyzer now empties every syntax tree a traceback's frames hold, node by node, as it has done with its own tree since ticket 09. A test in `src/engine/python.test.ts` runs 3,000 terms under Node.js.
- Not fixed: a deeper line runs out of stack in Python's own parser or compiler, before the analyzer can do anything. In Chromium that is `compile` at 3,000 terms; under Node.js, `ast.parse` and `compile` at 5,000. Pyodide calls it a fatal error, and the page shows "RangeError: Maximum call stack size exceeded". In our tests the next Run still worked. The user chose to leave recovery to ticket 20, which recreates the worker.
- Ticket 08 gave level 3 a general Template, `token.other`, for any token type without its own.
- Ticket 09 gave level 4 general Templates for any kind of syntax-tree node without its own: `node.other`, which names the node's type and its code, and `node.otherNoPlace`, for a node with no place in the code.
- Ticket 09 found that one long line, `print(1+1+…+1)` with 3,000 terms, stops Pyodide in Chromium with a fatal error, as it did before ticket 09. 1,200 terms works at every built level. The test program set can include a deeply nested line.
- Ticket 10 gave level 5 a general Template, `step.other`, for any opname without its own: "A UNARY_INVERT step". If the replay of the plates ever can't account for a frame's plates, level 5 says so for that frame instead of breaking; a mistake in the replay itself is caught the same way, so the Program still runs.
- Ticket 17: a syntax error whose message has no Template of its own gets `syntaxError.general`, which quotes Python's message.
