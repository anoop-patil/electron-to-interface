# 16: Examples load instantly from build-time Analyses

**What to build:** A first-time visitor can zoom through hello world immediately, before Pyodide has finished loading, and can pick any of the shipped Examples.

**Blocked by:** 07: Your program runs: real output and Events

**Status:** ready-for-agent

- [ ] Examples: hello world, a for loop, a function called in a loop (greet.py, from prototype v8), a list comprehension and a class. Apart from hello world, each is several lines long, within the 20-line limit. The syntax-error Example comes in its own ticket.
- [ ] Each Example's Analysis is computed at build time with the same pinned Python, shipped as static data, and validated against the schema.
- [ ] Hello world renders before Pyodide is ready, while Pyodide loads in the background. Examples run automatically.
- [ ] The learner can type their own Program while Pyodide loads. A friendly loading indicator shows until Run works.
- [ ] Browsers that can't run Pyodide (for example low-memory phones) still get every Example, plus a note.

## Comments

- Ticket 13: level 7's Try it yourself shows each Example's own native timing, captured on the test machine, and greet.py's for anything else. Only hello world and greet.py have one; a new Example gets greet.py's until the capture tools time it too.
- Ticket 14: level 8's Try it yourself does the same with strace's list of write calls (`samples` in the Reference Library, by zoom level). The build-time Analyses must carry `writes`, the pieces each Example handed to `sys.stdout` and `sys.stderr`, which level 8 follows.
