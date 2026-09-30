# ElectronToInterface

Write a short Python program (up to 20 lines, any Python feature), click Run, then keep zooming in: characters and bytes, tokens, the syntax tree, bytecode, the interpreter's C code, CPU instructions, the operating system and, finally, pixels on the screen. Every level is explained in plain English and says honestly how it knows what it shows. Think *Powers of Ten* for programming.

## Status

Planning and prototyping. The app itself isn't built yet.

- **Try the prototype:** open `prototype/hello-zoom-v8.html` in a browser. It walks through all nine zoom levels for a 5-line Example, `prototype/examples/greet.py`: a function called in a loop, printing two lines. Every step that ran more than once can be followed run by run, down to its machine code. The prototype carries only this Example's analysis; the app analyzes any program of up to 20 lines. `hello-zoom-v7.html` is the earlier one-line version.
- **The plan:** `Requirements.md`, with the glossary in `CONTEXT.md` and design decisions in `docs/adr/`.
- **The work:** tickets in `.scratch/app/issues/`, numbered in the order they can be built. Each lists the tickets that block it.

## Where the prototype's facts come from

Everything the prototype labels Observed or Reference was captured on Linux x86-64 with CPython 3.14.2 (python-build-standalone release 20251205). The scripts in `prototype/tools/` reproduce it:

- `extract-machine-code.sh`: disassembles the interpreter's handlers for each hello-world step.
- `trace-handler-paths.sh`: records, with gdb, which of those instructions actually run.
- `capture-example.sh greet`: captures everything v8 shows for an Example: bytes, tokens, syntax tree, bytecode, the order the steps ran in, which handler ran for each step on each run (gdb, 3 identical runs), and those handlers' machine code, including the parts BOLT moved elsewhere.
- `build-hello-zoom-v8.py`: builds `hello-zoom-v8.html` from its template and that data.
- `check-c-refs.mjs`: confirms that every quoted line of CPython C source sits at the line number shown.

The shell scripts run on Linux or WSL. They download what they need into `/tmp` and install nothing.

## License

- **Code:** MIT, see `LICENSE`.
- **Written content** (explanations, Concept cards, Templates and the documents in this repository): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Reuse it, for example in a classroom, with credit to ElectronToInterface.
- **CPython material:** PSF License, as below.

## Third-party material

The prototype quotes CPython's C source, and `prototype/data/` holds machine code disassembled from the CPython 3.14.2 binary. That material is copyright the Python Software Foundation and is used under the PSF License; see `licenses/CPython-LICENSE.txt`.
