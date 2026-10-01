# 08: Zoom level 3: Tokens

**What to build:** A learner sees their Program broken into tokens, laid over the source as chips, and can pick any token to learn what it is, where it sits and which bytes make it up. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes; 03: Explanations come from Templates filled with Facts; 04: Honesty labels and Concept cards; 05: Machine map; 06: Try it yourself

**Status:** ready-for-agent

- [x] `analyze()` returns tokens from `tokenize`, each a Fact (`tok-N`) with its span. For hello world: NAME `print`, OP `(`, STRING, OP `)`, NEWLINE, ENDMARKER.
- [x] For a multi-line Program, chips cover every line, including the NEWLINE, NL, INDENT and DEDENT tokens that mark line ends and indentation.
- [x] Token chips sit over the source, and picking one explains it, including its position in `tokenize`'s own `1,0-1,5` notation and its bytes.
- [x] Labeled Observed.
- [x] The machine map lights RAM: the Program, now read as tokens. The app never saves the Program to the disk, so the note doesn't say it was copied from there (ticket 05).
- [x] Try it yourself: `python -m tokenize` on the learner's file: captured output for the Examples, live output for the learner's own program (ticket 06). The analyzer can do what `python FILE` and `python -c` do so far; this ticket adds `python -m`.

## Comments

Built in `app/`. Decisions made along the way:

- The tokens come from `tokenize.tokenize` on the Program's bytes. Its ENCODING token isn't a place in the Program, so the Analysis records it as `encoding`, and `tok-0` is the first real token: for hello world, `print`. Level 3 names the encoding in a sentence under the chips.
- A token's `span` is its bytes, from start up to but not including end. tokenize counts columns in characters, so the analyzer counts each character's bytes in the encoding tokenize reported. A Program with a coding comment such as `# coding: latin-1` still gets the right bytes.
- A NAME that Python's `keyword` module lists is marked `keyword`, so the page keeps no list of Python's keywords.
- A Program that breaks the tokenizer, such as one with a bracket never closed, keeps the tokens found before the break, and Run still works. Ticket 17 explains the error.
- "Over the source" is read as v8 does it: one row of chips per line, labeled with the line number. A token over several lines, such as a triple-quoted string, takes its lines into one row, labeled "lines 1–3".
- The analyzer now does what `python -m MODULE` does, for a module but not a package: the module's file first in `sys.argv`, the working folder first in `sys.path`. Tickets 09 and 10 can use it for `python -m ast` and `python -m dis`.
- The app has no Examples until ticket 16, so, as in ticket 06, a test runs greet.py in Pyodide and confirms that its tokens and its `python -m tokenize` output match v8's capture, character for character.
- Changes from prototype v8's wording:
  - The introduction drops "When you run the file, the operating system reads its bytes into RAM", because the app never saves the file, and "using UTF-8", because a coding comment can name another encoding. The ENCODING sentence names the encoding tokenize reported.
  - v8's keyword text was written for def, for and in. The app has one Template for any keyword.
  - v8's six kinds of punctuation keep their own sentence, made true for every Program: the colon also says "Colons have other jobs too, as in dictionaries and slices." `=` is new. Any other punctuation or operator gets a general sentence.
  - INDENT says "deeper than the line of code before it", since a blank or comment line can come between. DEDENT says "line 4 starts further left, at column 0", and adds "Each block that ends gets its own DEDENT."
  - NL has three Templates: a line with no code (v8's empty line, and also a line of spaces), a line holding only a comment, and a line break inside brackets.
  - NUMBER and COMMENT have new Templates. Any other token type, such as FSTRING_START, gets a general one, "A token tokenize calls FSTRING_START", so unfamiliar code doesn't break level 3. Ticket 18 still adds the link to Python's docs.
  - The How to read it rows are worked out from the Program: the ENCODING line, then the first line of each kind the Program has (a position, NEWLINE, INDENT, NL, DEDENT, ENDMARKER), as tokenize printed it. A new note says that after ENCODING each line is one of the chips. When tokenize stops with an error, or its lines don't match the tokens, the tab shows neither.
- The Token Concept card is ported from v8, with print instead of greet. The How we know card now lists Token and Your steps as related cards, as v8's did; ticket 04 waited for both cards to exist.
- The Machine map note is "your program · read as 6 tokens", in RAM.
- The token colors are v8's, as the design tokens `--tok-name`, `--tok-op`, `--tok-str` and `--tok-mark`.
- Level 3 has no Selection until the learner picks a token, like level 2. A selected token isn't highlighted at levels 1 and 2 yet: that is ticket 11.
