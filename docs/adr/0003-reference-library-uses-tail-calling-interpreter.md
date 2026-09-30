# The Reference Library shows the tail-calling interpreter, built with Clang

Zoom level 7 shows machine instructions from one specific CPython build, so we had to pick one. We build CPython **3.14.2 exactly** (the version Pyodide ships, not the latest 3.14 patch) with Clang 19+, `--with-tail-call-interp`, PGO and LTO, for x86-64 first. In that build each opcode is its own small C function, so its machine code can be isolated and shown cleanly. In the GCC builds most Linux distributions ship, every opcode lives inside one huge function and their instructions are interleaved. We traded "what most people run" for "what can be taught clearly". The expandable details panel states the compiler and flags, and the Honesty label remains *Reference*.

## Considered Options

- **GCC with PGO and LTO, as distributions build it.** More representative, but per-opcode machine code is tangled and hard to attribute.
- **Unoptimized debug build.** The easiest to read, but nobody runs Python that way, so it would mislead.

## Consequences

- Upgrading the pinned Python version means rebuilding the Reference Library from that exact patch release and re-checking coverage.
- We may not need to build CPython ourselves. python-build-standalone's CPython 3.14.2 build for x86_64 Linux (release 20251205) is already built with Clang, the tail-calling interpreter, PGO and LTO, plus BOLT, and it keeps its symbols and debug info. Prototype v6 disassembles its handlers (`prototype/tools/extract-machine-code.py`); the binary's sha256 is recorded so the listing can be reproduced. Handler names carry LTO suffixes (`_TAIL_CALL_LOAD_NAME.llvm.<hash>`), and BOLT splits rarely used code into separate `.warm` and `.cold` parts, so the page shows the main part and states the size of the rest. Prototype v7 also records which instructions actually run for `print("Hello World!")`, by single-stepping each handler with gdb (`prototype/tools/trace-handler-paths.sh`); for hello world, none of the `.warm` or `.cold` code runs.
- Prototype v8 traces a function called in a loop (`prototype/tools/capture-example.sh`). There, `.warm` and `.cold` code does run: 102 of the 107 instructions `CALL_PY_EXACT_ARGS` ran are in those parts, so the Reference Library disassembles them too. The build also copies one handler's code into another: on the second call to the function, `RESUME_CHECK`'s code (lines 10543–10571 of `generated_cases.c.h`) runs at the end of `CALL_PY_EXACT_ARGS`, and no `RESUME` handler of its own runs. The page has to say so when a step's work ran inside another handler.
