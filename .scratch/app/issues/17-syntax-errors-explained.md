# 17: Syntax errors explained

**What to build:** A learner whose code has a syntax error sees the zoom levels that still make sense, as far as Python got, and a plain-English explanation of what went wrong.

**Blocked by:** 08: Zoom level 3: Tokens; 16: Examples load instantly from build-time Analyses

**Status:** ready-for-agent

- [ ] A syntax-error Example is added to the Examples.
- [ ] Levels 1 to 3 show as far as they get. Later levels say plainly why they're unavailable.
- [ ] The error is explained in plain English, pointing at the exact place in the code.

## Comments

- Ticket 09: a Program with a syntax error has no syntax tree. Level 4 says so in one sentence, `level4.noTree`, and points to the Terminal, which shows Python's traceback. This ticket can replace that sentence with the plain-English explanation.
- Ticket 16: add the syntax-error Example to `EXAMPLES` in `src/examples/examples.ts`; the build then makes its Analysis. `src/examples/build.test.ts` checks that every Example runs to the end and prints, so it needs an exception for this one. An Example's Analysis carries `example`, and Templates that would say the browser just ran it have an Example variant: check any new text for a Program with an error, such as `tryIt.level1.error`, against both.
