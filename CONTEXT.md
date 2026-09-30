# ElectronToInterface

A learning tool that lets someone zoom from a short Python program of their own down to bytes, bytecode, the interpreter, CPU instructions, the operating system and pixels, with every layer explained and honest about how it knows.

## The learner's program

**Program**:
The learner's own Python code: up to 20 lines, using any Python feature, limited only by what a browser can run.
_Avoid_: snippet, script, line (for the whole program)

**Run**:
The learner's signal that they have finished typing. It analyzes and runs the Program and opens the zoom view on it; nothing is analyzed while they type.
_Avoid_: submit, analyze, done

## Zooming

**Zoom level**:
One of the nine layers a learner can view, from their code as written (1) down to pixels on the screen (9).
_Avoid_: layer, depth, level (on its own)

**Machine map**:
The always-visible picture of the learner's computer (disk, RAM with its code, objects and plates, CPU, operating system, screen) that lights up where the thing being viewed lives right now.
_Avoid_: hardware diagram, memory view

**Selection**:
What the learner has picked at the current zoom level. At level 5 it is a Step run, and it decides what levels 6–9 show.
_Avoid_: focus, cursor, current line

**Interpreter handoff**:
The boundary between zoom levels 5 and 6, where the view stops showing the learner's code translated further and starts showing the interpreter program that reads it.
_Avoid_: compilation step

## Running

**Code object**:
The compiled steps of one piece of code: the file itself, or one function, class body, lambda or generator expression inside it. Each has its own Steps.
_Avoid_: recipe card (in docs; the UI uses it as an analogy), function bytecode

**Step**:
One bytecode instruction in a Code object, before anything runs.
_Avoid_: opcode (for the instruction in the program), instruction

**Step run**:
One time a Step ran. A Step inside a loop or a function has several; one that never ran has none.
_Avoid_: iteration, execution, hit, run (on its own, which means the learner's Run)

**Handler**:
The interpreter's machine code for one kind of Step, or for one of its specialized variants. On one Step run, a Step can run two Handlers: its general form, which rewrites the Step, then the specialized one.
_Avoid_: opcode function, case

## Facts

**Fact**:
One observed thing about the learner's program (a byte, token, syntax-tree node, Step, Step run or Event), identified by a stable Fact ID.
_Avoid_: data point, item

**Fact ID**:
The stable identifier of a Fact, used by Explanations and highlights to point at it.

**Analysis**:
The complete set of Facts produced from one program on one Python version.
_Avoid_: structured facts, structured execution model, facts JSON, trace

**Event**:
One step recorded while the program runs: a line, call, return or exception.
_Avoid_: trace event, trace

## Honesty

**Honesty label**:
The statement every zoom level, and any panel that differs from its level, carries about how it knows what it shows; exactly one of Observed, Derived, Reference, Illustrative or Typical.
_Avoid_: source, confidence

**Observed**:
Honesty label for content Python itself recorded from the learner's own program.
_Avoid_: traced, live, real

**Derived**:
Honesty label for content worked out from Observed facts using Python's rules, true for the learner's program but not recorded directly (for example, the plates on the stack).
_Avoid_: inferred, computed, simulated

**Reference**:
Honesty label for real content prepared in advance rather than taken from the learner's run, such as CPython source or measurements on a test machine.
_Avoid_: pre-traced reference, cached, precomputed

**Illustrative**:
Honesty label for a made-up example that shows the kind of thing that happens but is not real data.
_Avoid_: mock, placeholder, sample

**Typical**:
Honesty label for how something usually works, accurate in general but possibly different on the learner's computer.
_Avoid_: typical behavior, approximate

**Reference Library**:
The prepared collection of interpreter C source and CPU instructions for each specialized bytecode variant, which backs zoom levels 6 and 7.
_Avoid_: pre-traced opcode library, opcode library

**Coverage corpus**:
A set of real beginner programs used to measure how often the Reference Library has an exact match for what learners' code actually runs.
_Avoid_: test set, benchmark

## Explaining

**Template**:
Stored explanation text for one kind of element, written in one plain-English voice, with slots for Fact values.
_Avoid_: prompt

**Explanation**:
A Template filled in with the real Facts of the learner's program.
_Avoid_: AI explanation, exact explanation, template explanation

**Concept card**:
A short, self-contained explanation of a general computing idea (UTF-8, byte, stack, system call) that opens inside the app from a tag in the text, never by sending the learner to another website.
_Avoid_: glossary entry, tooltip, doc link

**Example**:
A curated program shipped with the tool (hello world, a for loop, a syntax error, and so on).
_Avoid_: sample, snippet, demo

**Share link**:
A link that carries a program inside itself, so opening it loads that program.
_Avoid_: permalink, saved program
