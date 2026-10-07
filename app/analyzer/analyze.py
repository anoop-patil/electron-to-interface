"""The analyzer: turns a Program into an Analysis, the Facts the zoom view shows.

It runs inside Pyodide in the learner's browser, and under CPython for the tests.
The shape of its output is defined by schema/analysis.schema.json.
"""

import ast
import builtins
import codecs
import dis
import importlib
import importlib.machinery
import importlib.util
import io
import keyword
import os
import platform
import shlex
import sys
import tokenize
import traceback
import types
import weakref

# The most Events, and the most step runs, the Analysis records. A longer run is cut short, and the Analysis says so.
RECORD_LIMIT = 2000


def analyze(code, file_name="program.py", commands=(), folder=None, clock=None):
    """
    Runs the Program once, saved as `file_name` in `folder` (the working folder if None), recording what it printed,
    its Events and the order its steps ran in. `commands` are Try it yourself commands, such as `python program.py`:
    each runs on the same file, and the Analysis records what it printed. `clock`, if given, is called with True as
    the Program or a command starts running and with False as it stops, so the page can stop one that runs too long.
    """
    # Code editors save a file with a newline at the end, so the Program always has one.
    program = code if code.endswith("\n") else code + "\n"
    folder = folder or os.getcwd()
    path = os.path.join(folder, file_name)
    with open(path, "wb") as file:
        file.write(program.encode("utf-8"))
    try:
        recorded = _record_run(file_name, folder, clock)
        command_runs, after_run = [], None
        for command in commands:
            run, ran = _run_command(command, folder, clock)
            command_runs.append(run)
            # `python FILE` runs the Program again, unwatched, so Python rewrites its busy steps as it would anywhere.
            if shlex.split(command) == ["python", file_name] and isinstance(ran, types.CodeType):
                after_run = _forms_after_run(ran)
    finally:
        os.remove(path)
    encoding, tokens = _tokens(program)
    bytecode = _bytecode(program, encoding, after_run)
    return {
        "pythonVersion": platform.python_version(),
        "program": program,
        "fileName": file_name,
        "bytes": _bytes(program),
        "encoding": encoding,
        "tokens": tokens,
        "ast": _syntax_tree(program, encoding),
        "bytecode": bytecode,
        **recorded,
        "commands": command_runs,
    }


def _bytes(program):
    facts = []
    line = 1
    for char_index, char in enumerate(program):
        for value in char.encode("utf-8"):
            facts.append({
                "id": f"byte-{len(facts)}",
                "value": value,
                "charIndex": char_index,
                "line": line,
            })
        if char == "\n":
            line += 1
    return facts


def _tokens(program):
    """
    The encoding tokenize read the Program's bytes with, and the tokens it found, as it reports them. A Program that
    breaks the tokenizer, such as one with a bracket never closed, keeps the tokens found before the break.
    """
    raw = program.encode("utf-8")
    encoding, facts, byte_at = None, [], None
    try:
        for token in tokenize.tokenize(io.BytesIO(raw).readline):
            if token.type == tokenize.ENCODING:
                encoding = token.string
                byte_at = _byte_positions(raw, encoding)
                continue
            facts.append({
                "id": f"tok-{len(facts)}",
                "type": tokenize.tok_name[token.type],
                "exactType": tokenize.tok_name[token.exact_type],
                "text": token.string,
                "start": {"line": token.start[0], "column": token.start[1]},
                "end": {"line": token.end[0], "column": token.end[1]},
                "span": {"start": byte_at(*token.start), "end": byte_at(*token.end)},
            })
            # tokenize calls every word a NAME; Python's keyword module says which ones Python reserves.
            if token.type == tokenize.NAME and keyword.iskeyword(token.string):
                facts[-1]["keyword"] = True
    except (tokenize.TokenError, SyntaxError):
        pass
    return encoding, facts


def _byte_positions(raw, encoding):
    """
    Turns tokenize's line and column into a position in the Program's bytes. tokenize counts columns in the characters
    it decoded with `encoding`, which a Program can name in a coding comment, so each character's bytes are counted in
    that encoding too.
    """
    text = raw.decode(encoding)
    # The utf-8-sig encoding leaves out the 3-byte mark at the start of the file.
    first = len(codecs.BOM_UTF8) if encoding == "utf-8-sig" else 0
    line_starts = [0] + [index + 1 for index, char in enumerate(text) if char == "\n"]
    byte_of_char = [first]
    for char in text:
        byte_of_char.append(byte_of_char[-1] + len(char.encode(encoding.removesuffix("-sig"))))

    def byte_at(line, column):
        return byte_of_char[min(line_starts[line - 1] + column, len(text))] if line <= len(line_starts) else len(raw)

    return byte_at


def _syntax_tree(program, encoding):
    """
    The Program's syntax tree, as ast.parse finds it in the Program's bytes, as Python does when it runs a file. The
    nodes come in the order `python -m ast` prints them: a node, then the nodes in each of its fields, in turn. A
    Program with a syntax error has none.
    """
    raw = program.encode("utf-8")
    try:
        tree = ast.parse(raw)
    except (SyntaxError, ValueError):
        return []
    position = _compiler_positions(raw, encoding)

    # Each node in order, with its parent's place in the order and the field holding it. This walks a stack rather
    # than calling itself, because one long line, such as 1+1+...+1, nests deeper than Python lets a function recurse.
    order, stack = [], [(tree, None, None)]
    while stack:
        node, parent, field = stack.pop()
        order.append((node, parent, field))
        children = [(item, len(order) - 1, name) for name, value in _shown_fields(node) for item in _items(value) if _is_box(item)]
        stack.extend(reversed(children))
    fact_id = {id(node): f"ast-{at}" for at, (node, _, _) in enumerate(order)}

    facts = []
    for node, parent, field in order:
        fact = {"id": fact_id[id(node)], "type": type(node).__name__, "parent": None if parent is None else f"ast-{parent}",
                "field": field, "span": None, "fields": []}
        # Some nodes have no place in the code, such as Module and arguments.
        if "lineno" in node._attributes:
            fact["span"] = {"start": position(node.lineno, node.col_offset), "end": position(node.end_lineno, node.end_col_offset)}
        for name, value in _shown_fields(node):
            ids = [fact_id[id(item)] for item in _items(value) if _is_box(item)]
            if ids:
                fact["fields"].append({"name": name, "nodes": ids, "list": isinstance(value, list)})
            else:
                fact["fields"].append({"name": name, "value": _shown_value(value)})
        facts.append(fact)
    _free_tree(tree)
    return facts


def _free_tree(tree):
    """
    Lets a syntax tree go. Python frees a node by freeing the nodes inside it first, one call inside another. For a deep
    tree that runs out of the browser's stack and stops Pyodide for good, so each node is emptied first and freed on
    its own.
    """
    stack = [tree]
    while stack:
        node = stack.pop()
        for name in node._fields:
            stack.extend(item for item in _items(getattr(node, name, None)) if isinstance(item, ast.AST))
            setattr(node, name, None)


def _compiler_positions(raw, encoding):
    """
    Turns a line and column, as ast and the compiler give them, into a position in the Program's bytes. They count
    columns in the UTF-8 bytes of the text they decoded; tokenize, and so _byte_positions, counts characters.
    """
    byte_at = _byte_positions(raw, encoding)
    lines = raw.decode(encoding).split("\n")
    return lambda line, column: byte_at(line, len(lines[line - 1].encode("utf-8")[:column].decode("utf-8")))


def _items(value):
    return value if isinstance(value, list) else [value]


def _is_box(value):
    """
    A node that is a box of its own. A marker, such as Load, Store or Add, is a node with no fields and no place in the
    code: it says what the node around it does, so it is one of that node's values instead.
    """
    return isinstance(value, ast.AST) and bool(value._fields or value._attributes)


def _shown_fields(node):
    """A node's fields, in order, leaving out those `python -m ast` leaves out: an empty list, or None where None is the default."""
    for name in node._fields:
        value = getattr(node, name, None)
        if value is None and getattr(type(node), name, ...) is None:
            continue
        if value == [] and getattr(type(node)._field_types.get(name), "__origin__", None) is list:
            continue
        yield name, value


def _shown_value(value):
    """A field that holds no box, as `python -m ast` writes it: 'print', Load(), 1 or [Lt()]."""
    if isinstance(value, ast.AST):
        return ast.dump(value)
    if isinstance(value, list):
        return "[" + ", ".join(_shown_value(item) for item in value) + "]"
    return repr(value)


# Bytecode

def _bytecode(program, encoding, after_run=None):
    """
    The steps of each of the Program's code objects, as dis shows them before anything runs, in the order step runs
    count the code objects, with the form each had become after the unwatched run, if there was one. A Program with a
    syntax error has none.
    """
    raw = program.encode("utf-8")
    try:
        module = compile(raw, "program.py", "exec")
    except (SyntaxError, ValueError):
        return []
    position = _compiler_positions(raw, encoding)
    codes = _code_objects(module)
    index = {code: at for at, code in enumerate(codes)}
    facts, numbered = [], 0
    for at, code in enumerate(codes):
        steps = list(dis.get_instructions(code))
        facts.append({
            "name": code.co_name,
            "qualname": code.co_qualname,
            "line": code.co_firstlineno,
            "names": list(code.co_names),
            "consts": [{"code": index[const]} if const in index else {"value": _safe_repr(const)} for const in code.co_consts],
            "varnames": list(code.co_varnames),
            "cellvars": list(code.co_cellvars),
            "freevars": list(code.co_freevars),
            "size": len(code.co_code),
            "steps": [_step(code, step, after, numbered + place, position)
                      for place, (step, after) in enumerate(zip(steps, steps[1:] + [None]))],
        })
        if after_run:
            for step, form in zip(facts[-1]["steps"], after_run[at]):
                step["afterRun"] = form
        numbered += len(steps)
    return facts


def _step(code, step, after, number, position):
    """One step, as dis shows it, with its two bytes, how many cache entries follow it, and its place in the Program."""
    where = step.positions
    span = None
    if where and where.lineno and where.col_offset is not None and where.end_col_offset is not None:
        span = {"start": position(where.lineno, where.col_offset), "end": position(where.end_lineno, where.end_col_offset)}
    # dis names a code object with its address in memory and the path of its file, which change from run to run.
    argrepr = f"<code object {step.argval.co_name}>" if isinstance(step.argval, types.CodeType) else step.argrepr
    end = after.offset if after else len(code.co_code)
    return {
        "id": f"bc-{number}",
        "offset": step.offset,
        "opname": step.opname,
        "arg": step.arg,
        "argrepr": argrepr,
        "bytes": list(code.co_code[step.offset:step.offset + 2]),
        "caches": (end - step.offset - 2) // 2,
        "line": step.line_number,
        "span": span,
        "jump": step.jump_target,
    }


# Running the Program as Python runs a file

def _main_module(file_name=None):
    """The module Python makes for the program it runs: for a file, it also records the file."""
    main = types.ModuleType("__main__")
    main.__builtins__ = builtins
    if file_name:
        main.__file__, main.__cached__ = file_name, None
        main.__loader__ = importlib.machinery.SourceFileLoader("__main__", file_name)
    return main


def _run_as_main(source, file_name, argv, path_entry, main, folder, stdout, stderr, stdin=None, clock=None, recorder=None):
    """
    Does what `python` does with a program: runs it as __main__, in `folder`, with stdout and stderr going where
    they're told and stdin giving only empty lines, and returns its exit status and the error that stopped it, if any.
    It runs in this Python, not a new one, so anything the analyzer or an earlier Run imported is already imported.
    `clock` is told when the code starts and stops running.
    """
    saved = (sys.stdin, sys.stdout, sys.stderr, sys.argv, list(sys.path), sys.modules["__main__"], os.getcwd())
    sys.stdin, sys.stdout, sys.stderr = stdin or _Stdin(), stdout, stderr
    sys.argv = argv
    sys.path.insert(0, path_entry)
    sys.modules["__main__"] = main
    os.chdir(folder)
    builtins.__import__, importlib.import_module = _blocking_import, _blocking_import_module
    try:
        compiled = source if isinstance(source, types.CodeType) else compile(source, file_name, "exec")
        if recorder:
            recorder.start(compiled)
        if clock:
            clock(True)
        try:
            exec(compiled, main.__dict__)
        finally:
            if clock:
                clock(False)
            if recorder:
                recorder.stop()
        return 0, None
    except SystemExit as exit:
        return _exit_status(exit, stderr), None
    except BaseException as error:
        # Leave out this function's own frame, so the traceback starts in the learner's file, as Python's does.
        tb = error.__traceback__.tb_next
        _leave_out_blocker(tb)
        traceback.print_exception(type(error), error, tb, file=stderr)
        _free_trees_in(tb)
        return 1, error
    finally:
        builtins.__import__, importlib.import_module = _IMPORT, _IMPORT_MODULE
        sys.stdin, sys.stdout, sys.stderr, sys.argv, sys.path[:], sys.modules["__main__"], cwd = saved
        os.chdir(cwd)


# Python's bridges to the browser it runs in. Code run here can't import them, so a Program, even one from a Share
# link, can't use the learner's browser. This only makes `import js` fail with a clear message: a Program can still
# find its way round it. What stops Python reaching other sites is the Content Security Policy (public/_headers).
BLOCKED_MODULES = frozenset({"js", "pyodide", "pyodide_js", "micropip"})
_IMPORT, _IMPORT_MODULE = builtins.__import__, importlib.import_module


def _blocked(name, importer):
    """Whether an import of `name` by code whose globals are `importer` is blocked. Pyodide's own modules may import each other."""
    if name.partition(".")[0] not in BLOCKED_MODULES:
        return False
    importer_name = importer.get("__name__") if isinstance(importer, dict) else None
    return not (isinstance(importer_name, str) and importer_name.partition(".")[0] in BLOCKED_MODULES | {"_pyodide"})


def _blocked_error(name):
    module = name.partition(".")[0]
    return ModuleNotFoundError(f"{module} is blocked here, so a program can't use your browser", name=module)


def _blocking_import(name, globals=None, locals=None, fromlist=(), level=0):
    """builtins.__import__ while code runs: it runs each import statement."""
    if level == 0 and _blocked(name, globals):
        raise _blocked_error(name)
    return _IMPORT(name, globals, locals, fromlist, level)


def _blocking_import_module(name, package=None):
    """importlib.import_module while code runs."""
    if not name.startswith(".") and _blocked(name, sys._getframe(1).f_globals):
        raise _blocked_error(name)
    return _IMPORT_MODULE(name, package)


def _leave_out_blocker(tb):
    """Takes the frames of the two functions above out of a traceback, so a blocked import reads like Python's own error."""
    while tb and tb.tb_next:
        if tb.tb_next.tb_frame.f_code in (_blocking_import.__code__, _blocking_import_module.__code__):
            tb.tb_next = tb.tb_next.tb_next
        else:
            tb = tb.tb_next


def _free_trees_in(tb):
    """
    Lets go of the syntax trees the frames of a traceback hold. `python -m ast` on one long line, such as 1+1+...+1,
    stops with a RecursionError. The error's traceback keeps the frame that holds the tree, so letting the error go
    would free the tree in one go.
    """
    for frame, _ in traceback.walk_tb(tb):
        for value in list(frame.f_locals.values()):
            if isinstance(value, ast.AST):
                _free_tree(value)


def _exit_status(exit, stderr):
    """What Python does with sys.exit(code): a number is the exit status; anything else is printed, and the status is 1."""
    if exit.code is None:
        return 0
    if isinstance(exit.code, int):
        return exit.code
    print(exit.code, file=stderr)
    return 1


def _run_command(command, folder, clock=None):
    """Does what `python FILE`, `python -c CODE` or `python -m MODULE` does, in `folder`, and returns what a terminal shows."""
    words = shlex.split(command)
    if len(words) >= 3 and words[:2] == ["python", "-c"]:
        source, file_name, argv, path_entry, main = words[2], "<string>", ["-c", *words[3:]], "", _main_module()
    elif len(words) >= 3 and words[:2] == ["python", "-m"]:
        source, file_name, argv, path_entry, main = _module_as_main(words[2], words[3:], folder)
    elif len(words) >= 2 and words[0] == "python" and not words[1].startswith("-"):
        file_name = os.path.join(folder, words[1])
        with open(file_name, "rb") as file:
            source = file.read()
        # Compiled here, so the code objects that ran can be read afterwards. A syntax error is left for the run to report.
        try:
            source = compile(source, file_name, "exec")
        except (SyntaxError, ValueError):
            pass
        argv, path_entry, main = words[1:], folder, _main_module(file_name)
    else:
        raise ValueError(f"The analyzer can’t run {command}")

    # A terminal shows stdout and stderr together, in the order they were written.
    terminal = io.StringIO()
    status, _ = _run_as_main(source, file_name, argv, path_entry, main, folder, terminal, terminal, clock=clock)
    return {"command": command, "output": terminal.getvalue(), "exitStatus": status}, source


def _forms_after_run(module):
    """
    The form each step of each code object had become after it ran, as dis shows it with adaptive=True: RESUME_CHECK,
    LOAD_CONST_MORTAL. Only an unwatched run shows them: while sys.monitoring watches each step, Python rewrites none.
    """
    return [[step.opname for step in dis.get_instructions(code, adaptive=True)] for code in _code_objects(module)]


def _module_as_main(name, args, folder):
    """
    What `python -m NAME` runs: the module's code, as __main__, with the module's own file first in sys.argv and the
    working folder first in sys.path, so a module there is found before Python's own.
    """
    sys.path.insert(0, folder)
    try:
        spec = importlib.util.find_spec(name)
    finally:
        sys.path.remove(folder)
    # A package, such as json, would run its __main__ module; no command needs one yet.
    if spec is None or spec.loader is None or spec.submodule_search_locations is not None:
        raise ValueError(f"The analyzer can’t run the module {name}")
    main = _main_module(spec.origin)
    main.__spec__, main.__loader__, main.__cached__ = spec, spec.loader, spec.cached
    return spec.loader.get_code(spec.name), spec.origin, [spec.origin, *args], folder, main


# The recorded run

def _record_run(file_name, folder, clock=None):
    """
    Runs the Program as `python FILE` would, recording what it printed and the pieces it handed to sys.stdout and
    sys.stderr, its Events, its step runs and how many times it read from sys.stdin.
    """
    path = os.path.join(folder, file_name)
    with open(path, "rb") as file:
        source = file.read()
    writes = _Writes()
    stdout, stderr, stdin = _Output(writes, 1), _Output(writes, 2), _Stdin()
    recorder = writes.recorder = _Recorder(stdout)
    _, error = _run_as_main(source, path, [file_name], folder, _main_module(path), folder, stdout, stderr, stdin, clock, recorder)
    if error is not None:
        # In a terminal, Python 3.14 colors a traceback, so the pieces it writes carry color codes. The Terminal panel
        # shows stderr without them, as a terminal draws it.
        writes.pieces = [piece for piece in writes.pieces if not piece.get("report")]
        traceback.print_exception(type(error), error, error.__traceback__.tb_next, file=_Output(writes, 2), colorize=True)
    return {
        "stdout": stdout.getvalue(),
        "stderr": stderr.getvalue(),
        "writes": writes.pieces,
        "writesCutShort": writes.cut_short,
        "error": _error_fact(error, path, source),
        "events": recorder.events,
        "runs": recorder.runs,
        **(recorder.replay.facts(recorder.runs) if recorder.replay else {"frames": [], "objects": []}),
        "eventsCutShort": recorder.events_cut_short,
        "runsCutShort": recorder.runs_cut_short,
        "stdinReads": stdin.reads,
    }


class _Stdin(io.TextIOBase):
    """
    sys.stdin while the Program runs. Nobody can type into the Python in a browser, so each line read is empty, as if
    Enter were pressed with nothing typed: input() returns "". Reading to the end, with read(), readlines() or a for
    loop, finds nothing, so it ends.
    """

    def __init__(self):
        super().__init__()
        self.reads = 0

    def readable(self):
        return True

    def readline(self, size=-1):
        self.reads += 1
        return "\n"

    def read(self, size=-1):
        self.reads += 1
        return ""

    def __next__(self):
        self.reads += 1
        raise StopIteration


def _error_fact(error, path, source):
    """
    The error that stopped the Program: its kind, its message, and the line of the Program it happened on. For a
    syntax error in the Program itself, also the code Python points at.
    """
    if error is None:
        return None
    if type(error) in _SYNTAX_ERRORS:
        # Python's own syntax errors, so reading their fields runs none of the Program's code.
        fact = {"type": type(error).__name__, "message": error.msg if isinstance(error.msg, str) else ""}
        if error.filename == path:
            return {**fact, "line": error.lineno, **_syntax_error_place(error, source)} if error.lineno else fact
    else:
        fact = {"type": _class_name(type(error)), "message": _safe_message(error)}
    if type(error) is ModuleNotFoundError and isinstance(error.name, str):
        # Python's own error for an import it couldn't find, so reading its name runs none of the Program's code.
        fact["module"] = error.name
        fact["standardLibrary"] = error.name.partition(".")[0] in sys.stdlib_module_names
        if error.name in BLOCKED_MODULES:
            fact["blocked"] = True
    # The last line of the Program's own file the traceback passes through. For a syntax error in code the Program
    # ran, such as eval("1 +"), that is the line that ran it.
    line = None
    tb = error.__traceback__
    while tb:
        if tb.tb_frame.f_code.co_filename == path:
            line = tb.tb_lineno
        tb = tb.tb_next
    return {**fact, "line": line} if line else fact


_SYNTAX_ERRORS = (SyntaxError, IndentationError, TabError)


def _syntax_error_place(error, source):
    """
    The code a syntax error points at, as tokenize counts positions: its start, and its end, if Python names one after
    the start. A place past the end of a line, or of the Program, moves back to the line's newline.
    """
    if not error.offset:
        return {}
    # Python counts columns in the characters it decoded, in the encoding a coding comment can name.
    try:
        encoding = tokenize.detect_encoding(io.BytesIO(source).readline)[0]
    except SyntaxError:
        encoding = "utf-8"
    lines = source.decode(encoding, errors="replace").split("\n")[:-1]

    def place(line, offset, past_newline):
        line = min(line, len(lines))
        return {"line": line, "column": max(0, min(offset - 1, len(lines[line - 1]) + past_newline))}

    start = place(error.lineno, error.offset, 0)
    if not error.end_lineno or not error.end_offset or error.end_offset < 1:
        return {"start": start}
    end = place(error.end_lineno, error.end_offset, 1)
    return {"start": start, "end": end} if (end["line"], end["column"]) > (start["line"], start["column"]) else {"start": start}


def _code_objects(code):
    """The Program's code objects: the file's own first, then each one inside it, depth first, in the order Python stores them."""
    found = [code]
    for const in code.co_consts:
        if isinstance(const, types.CodeType):
            found.extend(_code_objects(const))
    return found


class _Writes:
    """
    The pieces the Program hands to sys.stdout (door 1) and sys.stderr (door 2), and its flushes, in the order they
    happen, each with the step run that did it. Pieces written once the Program's code has stopped are Python's own
    report: the traceback of an error, or the message sys.exit was given. The first RECORD_LIMIT of the Program's own
    are kept.
    """

    def __init__(self):
        self.pieces = []
        self.cut_short = False
        self.recorder = None
        self._own = 0

    def add(self, door, text):
        if self.recorder is None or not self.recorder.running:
            self.pieces.append({"door": door, "text": text, "report": True})
        else:
            self._own_entry({"door": door, "text": text})

    def flushed(self, door):
        if self.recorder is not None and self.recorder.running:
            self._own_entry({"door": door, "flush": True})

    def _own_entry(self, entry):
        if self._own == RECORD_LIMIT:
            self.cut_short = True
            return
        self._own += 1
        run = self.recorder.current_run()
        self.pieces.append({**entry, **({"run": run} if run is not None else {})})


class _Output(io.StringIO):
    """sys.stdout or sys.stderr for the recorded run: it keeps what is written, and records each piece and flush."""

    def __init__(self, writes, door):
        super().__init__()
        self._writes = writes
        self._door = door

    def write(self, text):
        written = super().write(text)
        self._writes.add(self._door, text)
        return written

    def flush(self):
        super().flush()
        self._writes.flushed(self._door)


class _Recorder:
    """
    Records the Program's Events and step runs while it runs, with sys.monitoring, only in the Program's own code.

    sys.settrace would turn off the INSTRUCTION events that record step runs, so Events come from the monitoring
    events sys.settrace is itself built on, used as it uses them. Recording never runs the learner's code: see _safe_repr.
    """

    _EVENTS = sys.monitoring.events
    # The monitoring events each record needs. RAISE, RERAISE, PY_UNWIND and PY_THROW can't be turned on for single
    # code objects, only everywhere. Step runs need returns, yields and errors to replay the plates.
    _FOR_STEP_RUNS = _EVENTS.INSTRUCTION | _EVENTS.PY_START | _EVENTS.PY_RESUME | _EVENTS.PY_RETURN | _EVENTS.PY_YIELD
    _FOR_EVENTS = _EVENTS.PY_START | _EVENTS.PY_RESUME | _EVENTS.LINE | _EVENTS.JUMP | _EVENTS.PY_RETURN | _EVENTS.PY_YIELD
    _FOR_EVENTS_EVERYWHERE = _EVENTS.RAISE | _EVENTS.PY_UNWIND | _EVENTS.PY_THROW
    _FOR_STEP_RUNS_EVERYWHERE = _FOR_EVENTS_EVERYWHERE | _EVENTS.RERAISE

    def __init__(self, stdout):
        self.events, self.runs = [], []
        self.events_cut_short = self.runs_cut_short = False
        self._stdout = stdout
        self._printed = 0  # how much of stdout is already tied to a step run
        self._codes = {}
        self._lines = {}
        self._callbacks = {}
        self._tool = None
        self.replay = None

    def start(self, module):
        monitoring, events = sys.monitoring, self._EVENTS
        self._codes = {code: index for index, code in enumerate(_code_objects(module))}
        self.replay = _Replay(self._codes)
        self._tool = next(tool for tool in range(6) if monitoring.get_tool(tool) is None)
        monitoring.use_tool_id(self._tool, "ElectronToInterface")
        self._callbacks = {
            events.INSTRUCTION: self._on_instruction,
            events.PY_START: self._on_start,
            events.PY_RESUME: self._on_resume,
            events.PY_THROW: self._on_throw,
            events.LINE: self._on_line,
            events.JUMP: self._on_jump,
            events.PY_RETURN: self._on_return,
            events.PY_YIELD: self._on_yield,
            events.PY_UNWIND: self._on_unwind,
            events.RAISE: self._on_raise,
            events.RERAISE: self._on_reraise,
        }
        for event, callback in self._callbacks.items():
            monitoring.register_callback(self._tool, event, callback)
        self._update_events()

    @property
    def running(self):
        """Whether the Program's code is running: between start and stop."""
        return self._tool is not None

    def current_run(self):
        """The place in runs of the step run going on now, or None once the record of step runs is full."""
        return None if self.runs_cut_short or not self.runs else len(self.runs) - 1

    def stop(self):
        if self._tool is None:
            return
        if not self.runs_cut_short:
            self._tie_output()
        for code in self._codes:
            sys.monitoring.set_local_events(self._tool, code, 0)
        sys.monitoring.set_events(self._tool, 0)
        for event in self._callbacks:
            sys.monitoring.register_callback(self._tool, event, None)
        sys.monitoring.free_tool_id(self._tool)
        self._tool = None

    def _update_events(self):
        """Turns on only the events still needed: none for a record that is full."""
        local = (0 if self.runs_cut_short else self._FOR_STEP_RUNS) | (0 if self.events_cut_short else self._FOR_EVENTS)
        for code in self._codes:
            sys.monitoring.set_local_events(self._tool, code, local)
        everywhere = (0 if self.runs_cut_short else self._FOR_STEP_RUNS_EVERYWHERE) | (0 if self.events_cut_short else self._FOR_EVENTS_EVERYWHERE)
        sys.monitoring.set_events(self._tool, everywhere)

    # Step runs

    def _tie_output(self):
        """Ties what was printed since the last step run began to that step run."""
        # The Program only adds to stdout, so its position is its length; reading it all at every step would be slow.
        length = self._stdout.tell()
        if length > self._printed and self.runs:
            step_run = self.runs[-1]
            step_run["printed"] = step_run.get("printed", "") + self._stdout.getvalue()[self._printed:]
        self._printed = length

    def _add_run(self, code, offset, frame, starting=False):
        if self.runs_cut_short:
            return
        self._tie_output()
        if len(self.runs) == RECORD_LIMIT:
            self.runs_cut_short = True
            self._update_events()
            return
        self.runs.append({"id": f"run-{len(self.runs)}", "code": self._codes[code], "offset": offset})
        self._replaying(self.replay.step, self.runs, frame, code, offset, starting)

    def _replaying(self, call, *args):
        """Replays the plates. A mistake in the replay marks the plates unsure from there, rather than stopping the Program."""
        if self.runs_cut_short or self.replay.broken:
            if self.runs and not self.runs_cut_short:
                self.runs[-1]["platesUnsure"] = True
            return
        try:
            call(*args)
        except Exception:
            self.replay.broken = True
            if self.runs:
                self.runs[-1]["platesUnsure"] = True

    def _on_instruction(self, code, offset):
        self._add_run(code, offset, sys._getframe(1))

    # INSTRUCTION events don't report RESUME. It runs where a code object starts, or carries on after a yield, which
    # is when PY_START and PY_RESUME are reported, at its offset.

    def _on_start(self, code, offset):
        self._add_run(code, offset, sys._getframe(1), starting=True)
        self._add_event("call", code, line=code.co_firstlineno)

    def _on_resume(self, code, offset):
        self._add_run(code, offset, sys._getframe(1))
        self._add_event("call", code)

    # Events

    def _add_event(self, kind, code, line=None, value=None):
        if self.events_cut_short or code not in self._codes:
            return
        if len(self.events) == RECORD_LIMIT:
            self.events_cut_short = True
            self._update_events()
            return
        # This callback was called by the Program's own frame.
        frame = sys._getframe(2)
        event = {
            "id": f"ev-{len(self.events)}",
            "kind": kind,
            "code": self._codes[code],
            # A step with no line of its own, such as the cleanup after an error, has a line number of None.
            "line": line or frame.f_lineno or code.co_firstlineno,
            "locals": {name: _safe_repr(value) for name, value in frame.f_locals.items() if not _is_dunder(name)},
        }
        if value is not None:
            event["value"] = value
        self.events.append(event)

    def _on_throw(self, code, offset, exception):
        self._add_event("call", code)
        self._replay_raise(code, exception)

    def _on_line(self, code, line):
        self._add_event("line", code, line=line)

    def _on_jump(self, code, source, destination):
        # LINE is reported when the line changes. A loop that jumps back to the start of the same line starts it
        # again too, and sys.settrace reports that as a line.
        if destination < source and self._line_of(code, destination) == self._line_of(code, source):
            self._add_event("line", code, line=self._line_of(code, destination))

    def _line_of(self, code, offset):
        if code not in self._lines:
            self._lines[code] = {step: line for start, end, line in code.co_lines() for step in range(start, end, 2)}
        return self._lines[code].get(offset)

    def _on_return(self, code, offset, value):
        self._add_event("return", code, value=_safe_repr(value))
        self._replaying(self.replay.returned, sys._getframe(1), code, value)

    def _on_yield(self, code, offset, value):
        self._add_event("return", code, value=_safe_repr(value))
        self._replaying(self.replay.yielded, sys._getframe(1), code, value)

    def _on_unwind(self, code, offset, exception):
        self._add_event("return", code)
        if code in self._codes:
            self._replaying(self.replay.ended, sys._getframe(1), code)

    def _on_raise(self, code, offset, exception):
        self._add_event("exception", code, value=_safe_exception(exception))
        self._replay_raise(code, exception)

    def _on_reraise(self, code, offset, exception):
        self._replay_raise(code, exception)

    def _replay_raise(self, code, exception):
        # This callback was called by the Program's own frame.
        if code in self._codes:
            self._replaying(self.replay.raised, sys._getframe(2), code, exception)


# The plates: each frame's stack, replayed from the step runs with Python's rules

# How many plates each kind of step takes and puts back, given its argument, as CPython 3.14.2 says in
# Include/internal/pycore_opcode_metadata.h (_PyOpcode_num_popped and _PyOpcode_num_pushed), then how many of the
# plates it takes it leaves as they were, from the step's stack signature in Python/bytecodes.c: FOR_ITER takes the
# iterator and puts it back with the next item on top, so it keeps 1.
_PLATE_RULES = {
    "ANNOTATIONS_PLACEHOLDER": (0, 0), "BINARY_OP": (2, 1), "BINARY_SLICE": (3, 1),
    "BUILD_INTERPOLATION": (lambda arg: 2 + (arg & 1), 1), "BUILD_LIST": (lambda arg: arg, 1),
    "BUILD_MAP": (lambda arg: arg * 2, 1), "BUILD_SET": (lambda arg: arg, 1), "BUILD_SLICE": (lambda arg: arg, 1),
    "BUILD_STRING": (lambda arg: arg, 1), "BUILD_TEMPLATE": (2, 1), "BUILD_TUPLE": (lambda arg: arg, 1),
    "CALL": (lambda arg: 2 + arg, 1), "CALL_FUNCTION_EX": (4, 1), "CALL_INTRINSIC_1": (1, 1),
    "CALL_INTRINSIC_2": (2, 1), "CALL_KW": (lambda arg: 3 + arg, 1), "CHECK_EG_MATCH": (2, 2),
    "CHECK_EXC_MATCH": (2, 2, 1), "CLEANUP_THROW": (3, 2), "COMPARE_OP": (2, 1), "CONTAINS_OP": (2, 1),
    "CONVERT_VALUE": (1, 1), "COPY": (lambda arg: arg, lambda arg: arg + 1, lambda arg: arg), "COPY_FREE_VARS": (0, 0),
    "DELETE_ATTR": (1, 0), "DELETE_DEREF": (0, 0), "DELETE_FAST": (0, 0), "DELETE_GLOBAL": (0, 0),
    "DELETE_NAME": (0, 0), "DELETE_SUBSCR": (2, 0),
    "DICT_MERGE": (lambda arg: 4 + arg, lambda arg: 3 + arg, lambda arg: 3 + arg),
    "DICT_UPDATE": (lambda arg: 1 + arg, lambda arg: arg, lambda arg: arg), "END_ASYNC_FOR": (2, 0),
    "END_FOR": (1, 0), "END_SEND": (2, 1), "EXIT_INIT_CHECK": (1, 0), "EXTENDED_ARG": (0, 0),
    "FORMAT_SIMPLE": (1, 1), "FORMAT_WITH_SPEC": (2, 1), "FOR_ITER": (1, 2, 1), "GET_AITER": (1, 1),
    "GET_ANEXT": (1, 2, 1), "GET_AWAITABLE": (1, 1), "GET_ITER": (1, 1), "GET_LEN": (1, 2, 1),
    "GET_YIELD_FROM_ITER": (1, 1), "IMPORT_FROM": (1, 2, 1), "IMPORT_NAME": (2, 1), "IS_OP": (2, 1),
    "JUMP_BACKWARD": (0, 0), "JUMP_BACKWARD_NO_INTERRUPT": (0, 0), "JUMP_FORWARD": (0, 0),
    "LIST_APPEND": (lambda arg: 1 + arg, lambda arg: arg, lambda arg: arg),
    "LIST_EXTEND": (lambda arg: 1 + arg, lambda arg: arg, lambda arg: arg),
    "LOAD_ATTR": (1, lambda arg: 1 + (arg & 1)), "LOAD_BUILD_CLASS": (0, 1), "LOAD_COMMON_CONSTANT": (0, 1),
    "LOAD_CONST": (0, 1), "LOAD_DEREF": (0, 1), "LOAD_FAST": (0, 1), "LOAD_FAST_AND_CLEAR": (0, 1),
    "LOAD_FAST_BORROW": (0, 1), "LOAD_FAST_BORROW_LOAD_FAST_BORROW": (0, 2), "LOAD_FAST_CHECK": (0, 1),
    "LOAD_FAST_LOAD_FAST": (0, 2), "LOAD_FROM_DICT_OR_DEREF": (1, 1), "LOAD_FROM_DICT_OR_GLOBALS": (1, 1),
    "LOAD_GLOBAL": (0, lambda arg: 1 + (arg & 1)), "LOAD_LOCALS": (0, 1), "LOAD_NAME": (0, 1),
    "LOAD_SMALL_INT": (0, 1), "LOAD_SPECIAL": (1, 2), "LOAD_SUPER_ATTR": (3, lambda arg: 1 + (arg & 1)),
    "MAKE_CELL": (0, 0), "MAKE_FUNCTION": (1, 1),
    "MAP_ADD": (lambda arg: 2 + arg, lambda arg: arg, lambda arg: arg), "MATCH_CLASS": (3, 1),
    "MATCH_KEYS": (2, 3, 2), "MATCH_MAPPING": (1, 2, 1), "MATCH_SEQUENCE": (1, 2, 1), "NOP": (0, 0),
    "NOT_TAKEN": (0, 0), "POP_EXCEPT": (1, 0), "POP_ITER": (1, 0), "POP_JUMP_IF_FALSE": (1, 0),
    "POP_JUMP_IF_NONE": (1, 0), "POP_JUMP_IF_NOT_NONE": (1, 0), "POP_JUMP_IF_TRUE": (1, 0), "POP_TOP": (1, 0),
    "PUSH_EXC_INFO": (1, 2), "PUSH_NULL": (0, 1), "RAISE_VARARGS": (lambda arg: arg, 0),
    "RERAISE": (lambda arg: 1 + arg, lambda arg: arg, lambda arg: arg), "RESUME": (0, 0),
    "RETURN_GENERATOR": (0, 1), "RETURN_VALUE": (1, 1), "SEND": (2, 2, 1), "SETUP_ANNOTATIONS": (0, 0),
    "SET_ADD": (lambda arg: 1 + arg, lambda arg: arg, lambda arg: arg), "SET_FUNCTION_ATTRIBUTE": (2, 1),
    "SET_UPDATE": (lambda arg: 1 + arg, lambda arg: arg, lambda arg: arg), "STORE_ATTR": (2, 0),
    "STORE_DEREF": (1, 0), "STORE_FAST": (1, 0), "STORE_FAST_LOAD_FAST": (1, 1), "STORE_FAST_STORE_FAST": (2, 0),
    "STORE_GLOBAL": (1, 0), "STORE_NAME": (1, 0), "STORE_SLICE": (4, 0), "STORE_SUBSCR": (3, 0),
    "SWAP": (lambda arg: arg, lambda arg: arg), "TO_BOOL": (1, 1), "UNARY_INVERT": (1, 1),
    "UNARY_NEGATIVE": (1, 1), "UNARY_NOT": (1, 1),
    "UNPACK_EX": (1, lambda arg: 1 + (arg & 0xFF) + (arg >> 8)), "UNPACK_SEQUENCE": (1, lambda arg: arg),
    "WITH_EXCEPT_START": (5, 6, 5), "YIELD_VALUE": (1, 1),
}


def _plate_counts(opname, arg):
    """How many plates a step takes, how many it puts back, and how many of those it takes it leaves as they were."""
    took, put, *kept = _PLATE_RULES[opname]
    count = lambda rule: rule(arg) if callable(rule) else rule
    return count(took), count(put), count(kept[0]) if kept else 0


_MISSING = object()
_CO_OPTIMIZED = 0x1  # a code object whose variables live in its frame: a function, lambda or comprehension
# What frame.f_locals gives for a function: a view of its variables, which reading runs none of the Program's code.
_FRAME_LOCALS = type((lambda: sys._getframe().f_locals)())
_OBJECT_GETATTRIBUTE = object.__dict__["__getattribute__"]
_HEAP_TYPE = 1 << 9  # Py_TPFLAGS_HEAPTYPE: a class made by running Python code, rather than built into Python
# Objects the replay can hold on to without changing what the Program does: they can't hold the Program's objects,
# and nothing happens when they are freed.
_HELD = (int, float, complex, bool, str, bytes, type(None), type(...), range, types.CodeType)
# Objects whose repr can change while the Program runs, because they hold others that can change.
_CHANGING = (list, dict, set, bytearray, tuple, frozenset)
# Variables Python itself gives a class body or a method, rather than the Program.
_PYTHONS_NAMES = {"__module__", "__qualname__", "__firstlineno__", "__static_attributes__", "__classdict__", "__classdictcell__",
                  "__classcell__", "__class__", "__type_params__", "__annotate__", "__conditional_annotations__"}


class _Label:
    """
    What a plate or a variable holds: a label for an object. `found` is the object's place in the list of objects,
    once Python's rules or the run show which object it is. Copies of a label share it.
    """

    __slots__ = ("made_by", "found", "empty", "value")

    def __init__(self, made_by, found=None, empty=False, value=_MISSING):
        self.made_by = made_by
        self.found = found if found is not None else [None]
        self.empty = empty
        # While the label is on a plate, the replay holds its object, if it has it. The frame's own stack holds the
        # object then too, so holding it changes nothing for the Program.
        self.value = value

    def copy(self, made_by):
        return _Label(made_by, self.found, self.empty, self.value)

    def fact(self):
        fact = {"madeBy": f"run-{self.made_by}"}
        if self.empty:
            fact["empty"] = True
        elif self.found[0] is not None:
            fact["object"] = f"obj-{self.found[0]}"
        return fact


class _Objects:
    """
    The objects that plates and variables point to, each recorded the first time it is seen. The list holds on to
    none of the Program's own objects, which would change when they are freed, and so what the Program does.
    """

    def __init__(self, codes):
        self.facts = []
        self._codes = codes
        self._seen = {}  # id(object) -> (its place, a way to get it back, its class)
        self._getters = []  # by place: a way to get the object back, if the list holds it or can hold it weakly
        self._calls = {}  # its place -> the code object calling it runs, for a function written in Python
        self._shown_last = []  # by place: its repr when last seen
        self.run = None  # the step run being replayed, which records a changed repr

    def place(self, value):
        """The object's place in the list, recording it if it is new. A list or dictionary seen again may have changed."""
        kind = type(value)
        seen = self._seen.get(id(value))
        if seen is not None:
            at, get, kind_seen = seen
            # An object can be freed, and a new one made at the same address. An object held, or held weakly, is
            # checked; any other is taken to be the same object if it is of the same class.
            if kind_seen is kind and (get is None or get() is value):
                if kind in _CHANGING and self.run is not None:
                    shown = self._shown(value)
                    if shown != self._shown_last[at]:
                        self._shown_last[at] = shown
                        self.run.setdefault("objects", []).append({"object": f"obj-{at}", "repr": shown})
                return at
        at = len(self.facts)
        if kind in _HELD:
            get = (lambda held: lambda: held)(value)
        else:
            try:
                get = weakref.ref(value)
            except TypeError:
                get = None
        self._seen[id(value)] = (at, get, kind)
        self._getters.append(get)
        fact = {"id": f"obj-{at}", "type": _class_name(kind), "repr": self._shown(value)}
        self._shown_last.append(fact["repr"])
        if value in self._codes if kind is types.CodeType else False:
            fact["code"] = self._codes[value]
        # Python's own types report their size themselves; a class of the Program's could run its code to do it.
        if not type.__dict__["__flags__"].__get__(kind) & _HEAP_TYPE:
            fact["size"] = sys.getsizeof(value)
        self.facts.append(fact)
        if kind is types.FunctionType:
            self._calls[at] = value.__code__
        elif kind is types.MethodType and type(value.__func__) is types.FunctionType:
            self._calls[at] = value.__func__.__code__
        return at

    @staticmethod
    def _shown(value):
        if type(value) is types.CodeType:
            return f"<code object {value.co_name}>"
        # isinstance would ask the object for its __class__, which the Program's own class can make run code.
        if BaseException in type.__dict__["__mro__"].__get__(type(value)):
            return _safe_exception(value)
        if type(value) in (types.MethodDescriptorType, types.WrapperDescriptorType, types.MethodWrapperType):
            return f"<method {value.__name__}>"
        if type(value) is types.MethodType and type(value.__func__) is types.FunctionType:
            return f"<method {value.__func__.__qualname__}>"
        return _safe_repr(value)

    def get(self, label):
        """The object a label points to, if it is known and can still be had, or _MISSING."""
        if label.value is not _MISSING:
            return label.value
        at = label.found[0]
        get = None if at is None or label.empty else self._getters[at]
        value = get() if get else None
        return _MISSING if value is None else value

    def calls(self, label):
        """The code object a call to the labeled object runs, if it is a function written in Python."""
        return None if label.empty or label.found[0] is None else self._calls.get(label.found[0])


class _Frame:
    """The replay's record of one frame: its plates, and what its last step left to settle when its next step runs."""

    __slots__ = ("index", "code", "plates", "variables", "caller", "last", "last_run", "pending", "pending_at", "awaiting",
                 "calling", "raised", "returns_to", "unsure")

    def __init__(self, index, code, caller):
        self.index, self.code, self.caller = index, code, caller
        self.plates = []
        self.variables = {}  # name -> label
        self.last = self.last_run = None
        self.pending = []  # the labels its last step puts on its plates, once it is known that it finished
        self.pending_at = None  # for FOR_ITER, the offset its next step must have for them to go on
        self.awaiting = None  # the label for what a generator it resumed hands back, for FOR_ITER and SEND
        self.calling = None  # (code object, label) while a call it made to a function written in Python is under way
        self.raised = None  # the label for an error raised in it since its last step
        self.returns_to = None  # (frame, label) for the frame whose call started it, waiting for its answer
        self.unsure = False


class _Replay:
    """
    Replays each frame's plates and variables from the step runs, with Python's rules for how many plates each step
    takes and puts back. A step's labels are known from what it loads: a fixed value, or a variable or name read from
    the frame just before it runs. A step that works out a new object, such as a call or a sum, puts a label whose
    object is found later, if a variable stores it or a frame returns it. Nothing here runs the Program's code.
    """

    def __init__(self, codes):
        self.codes = codes
        self.objects = _Objects(codes)
        self.frames = []
        self._steps = {}
        self._live = {}  # id(frame) -> _Frame, for the frames still running or suspended
        self._module = None
        self.broken = False

    def _step_at(self, code, offset):
        if code not in self._steps:
            steps = list(dis.get_instructions(code))
            ends = [after.offset for after in steps[1:]] + [len(code.co_code)]
            self._steps[code] = {step.offset: (step, end) for step, end in zip(steps, ends)}
        return self._steps[code][offset]

    # The frames

    def _frame(self, frame, code, starting, previous):
        record = self._live.get(id(frame))
        if record is not None and record.code is code and not starting:
            if record.last is None or self._step_at(code, record.last)[0].opname == "YIELD_VALUE":
                record.caller = self._caller_of(frame)
            return record
        caller = self._caller_of(frame)
        record = _Frame(len(self.frames), code, caller)
        self.frames.append({"id": f"frame-{record.index}", "code": self.codes[code]})
        self._live[id(frame)] = record
        if self._module is None:
            self._module = record
        if caller and caller.calling and caller.calling[0] is code:
            record.returns_to = (caller, caller.calling[1])
            caller.calling = None
        # A function starts with its inputs already in its variables. They are there as the step that called it ends.
        if code.co_flags & _CO_OPTIMIZED and previous is not None:
            for name, value in frame.f_locals.items():
                self._set(previous, record, name, _Label(previous["index"], [self.objects.place(value)]))
        return record

    def _caller_of(self, frame):
        """The frame of the Program's own code that the frame was called from, perhaps through Python's own code."""
        frame = frame.f_back
        while frame is not None:
            record = self._live.get(id(frame))
            if record is not None and record.code is frame.f_code:
                return record
            frame = frame.f_back
        return None

    def step(self, runs, frame, code, offset, starting):
        """Replays a step run, just before the step runs, in `frame`."""
        at = len(runs) - 1
        run = runs[at]
        run["index"] = at
        previous = runs[at - 1] if at else None
        record = self._frame(frame, code, starting, previous)
        run["frame"] = record.index
        run["caller"] = record.caller.index if record.caller else None
        self.objects.run = run
        if not record.unsure:
            self._settle(record, offset, previous)
            self._refresh(record, frame, run)
        if not record.unsure:
            self._run(record, frame, code, offset, run)
        if record.unsure:
            run["platesUnsure"] = True
        record.last, record.last_run = offset, at

    def returned(self, frame, code, value):
        record = self._live.pop(id(frame), None)
        if record is None or record.code is not code:
            return
        self._let_go(record)
        found = [self.objects.place(value)]
        if record.returns_to:
            caller, answer = record.returns_to
            # The caller is still waiting for this answer, unless an error ended the call.
            if answer in caller.pending:
                answer.found[0] = found[0]

    def yielded(self, frame, code, value):
        record = self._live.get(id(frame))
        if record is None or record.code is not code:
            return
        if record.caller and record.caller.awaiting:
            record.caller.awaiting.found[0] = self.objects.place(value)

    def ended(self, frame, code):
        record = self._live.get(id(frame))
        if record is not None and record.code is code:
            del self._live[id(frame)]
            self._let_go(record)

    @staticmethod
    def _let_go(record):
        """A frame that has finished holds no objects."""
        for label in record.plates:
            label.value = _MISSING

    def raised(self, frame, code, exception):
        record = self._live.get(id(frame))
        if record is not None and record.code is code and record.last_run is not None:
            record.raised = _Label(record.last_run, [self.objects.place(exception)])

    # Changing a frame's plates and variables

    def _change(self, run, record, took, put):
        if took > len(record.plates):
            # The rules can't account for this frame's plates any more, so it shows none from here.
            record.unsure = True
            run["platesUnsure"] = True
            took, put = len(record.plates), []
        if took:
            for label in record.plates[len(record.plates) - took:]:
                label.value = _MISSING
            del record.plates[len(record.plates) - took:]
        record.plates.extend(put)
        if took or put:
            run.setdefault("plates", []).append({"frame": record.index, "took": took, "put": put})

    def _settle(self, record, offset, previous):
        """What the frame's last step left: its labels put on the plates, now that it finished, or an error caught."""
        pending, record.pending = record.pending, []
        record.awaiting = None
        if record.raised is not None:
            error, record.raised = record.raised, None
            handler = next((entry for entry in dis._parse_exception_table(record.code)
                            if entry.start <= record.last < entry.end), None)
            if handler and handler.target == offset:
                # The plates go back to where they were when the try started, then the error goes on top: under it,
                # for some handlers, the place in the bytecode where it happened.
                where = [_Label(record.last_run, [self.objects.place(record.last // 2)])] if handler.lasti else []
                self._change(previous, record, max(0, len(record.plates) - handler.depth), where + [error])
                return
        # FOR_ITER puts the next item on only if the frame carries on with the step after it, inside the loop.
        if pending and record.pending_at in (None, offset):
            self._change(previous, record, 0, pending)

    def _refresh(self, record, frame, run):
        """
        Reads the frame's variables as its step starts. A variable stored a label whose object wasn't known gets it;
        one changed by another frame, through nonlocal or global, gets a new label.
        """
        for name, label in list(record.variables.items()):
            value = self._read(frame.f_locals, name)
            if value is _MISSING:
                continue
            at = self.objects.place(value)
            if label.found[0] is None:
                label.found[0] = at
            elif label.found[0] != at:
                self._set(run, record, name, _Label(run["index"], [at]))

    def _run(self, record, frame, code, offset, run):
        step, end = self._step_at(code, offset)
        name, arg, at = step.opname, step.arg, run["index"]
        if name not in _PLATE_RULES:
            record.unsure = True
            return
        took, put, kept = _plate_counts(name, arg)
        plates = record.plates
        new = lambda: _Label(at)
        known = lambda value: _Label(at, [self.objects.place(value)], value=value) if value is not _MISSING else _Label(at)
        empty = lambda: _Label(at, empty=True)
        puts = None
        if took > len(plates):
            self._change(run, record, took, [])
            return

        if name == "LOAD_CONST" or name == "LOAD_SMALL_INT":
            puts = [known(step.argval)]
        elif name == "LOAD_COMMON_CONSTANT":
            puts = [known(step.argval if not isinstance(step.argval, str) else builtins.__dict__.get(step.argval, _MISSING))]
        elif name == "PUSH_NULL":
            puts = [empty()]
        elif name == "LOAD_BUILD_CLASS":
            puts = [known(builtins.__build_class__)]
        elif name == "LOAD_NAME":
            puts = [known(self._lookup(frame, step.argval, local=True))]
        elif name == "LOAD_GLOBAL":
            puts = [known(self._lookup(frame, step.argval))] + ([empty()] if arg & 1 else [])
        elif name in ("LOAD_FAST", "LOAD_FAST_BORROW", "LOAD_FAST_CHECK", "LOAD_DEREF"):
            puts = [known(self._read(frame.f_locals, step.argval))]
        elif name == "LOAD_FAST_AND_CLEAR":
            value = self._read(frame.f_locals, step.argval)
            puts = [empty() if value is _MISSING else known(value)]
            self._delete(run, record, step.argval)
        elif name in ("LOAD_FAST_LOAD_FAST", "LOAD_FAST_BORROW_LOAD_FAST_BORROW"):
            puts = [known(self._read(frame.f_locals, variable)) for variable in step.argval]
        elif name == "LOAD_ATTR":
            found = self._attribute(plates[-1], step.argval, arg & 1)
            puts = [known(value) if value is not None else empty() for value in found] if found else [new() for _ in range(put)]
        elif name in ("STORE_NAME", "STORE_FAST", "STORE_DEREF", "STORE_GLOBAL"):
            self._store(run, record, step.argval, plates[-1], name)
        elif name == "STORE_FAST_STORE_FAST":
            first, second = step.argval
            self._store(run, record, first, plates[-1], name)
            self._store(run, record, second, plates[-2], name)
        elif name == "STORE_FAST_LOAD_FAST":
            stored, loaded = step.argval
            label = plates[-1]
            self._store(run, record, stored, label, name)
            puts = [label.copy(at) if loaded == stored else known(self._read(frame.f_locals, loaded))]
        elif name in ("DELETE_NAME", "DELETE_FAST", "DELETE_DEREF", "DELETE_GLOBAL"):
            self._delete(run, self._module if name == "DELETE_GLOBAL" else record, step.argval)
        elif name in ("CALL", "CALL_KW", "CALL_FUNCTION_EX"):
            answer = new()
            callee = self.objects.calls(plates[-took])
            if callee in self.codes:
                record.calling = (callee, answer)
            puts = [answer]
        elif name == "COPY":
            puts = [plates[-arg].copy(at)]
        elif name == "SWAP":
            swapped = [label.copy(label.made_by) for label in plates[-arg:]]
            swapped[0], swapped[-1] = swapped[-1], swapped[0]
            puts = swapped
        elif name in ("PUSH_EXC_INFO", "LOAD_SPECIAL"):
            puts = [new(), plates[-1].copy(plates[-1].made_by)]
        elif name in ("SET_FUNCTION_ATTRIBUTE", "END_SEND"):
            puts = [plates[-1].copy(plates[-1].made_by)]
        elif name in ("FOR_ITER", "SEND"):
            record.awaiting = new()
            puts = [record.awaiting]
        elif name == "RETURN_VALUE":
            took, puts = 1, []

        took -= kept
        if puts is None:
            puts = [new() for _ in range(put - kept)]
        self._change(run, record, took, [])
        # The labels go on when the step has finished, which is known when the frame's next step runs: FOR_ITER
        # puts the next item on only if it didn't jump past the loop, and an error means nothing goes on at all.
        record.pending = puts
        record.pending_at = end if name == "FOR_ITER" else None

    def _store(self, run, record, name, label, opname):
        owner = self._module if opname == "STORE_GLOBAL" else record
        # An empty plate stored in a variable unbinds it, as a comprehension does to put back a variable it borrowed.
        if label.empty:
            self._delete(run, owner, name)
        else:
            self._set(run, owner, name, label.copy(label.made_by))

    @staticmethod
    def _set(run, record, name, label):
        record.variables[name] = label
        if name not in _PYTHONS_NAMES:
            run.setdefault("variables", []).append({"frame": record.index, "name": name, "value": label})

    @staticmethod
    def _delete(run, record, name):
        if record.variables.pop(name, None) is not None and name not in _PYTHONS_NAMES:
            run.setdefault("variables", []).append({"frame": record.index, "name": name, "deleted": True})

    # Reading what a step loads, without running any code

    @staticmethod
    def _read(mapping, name):
        """A variable's object, from a frame's own variables or a dictionary of names; _MISSING if it has none."""
        if type(mapping) not in (dict, _FRAME_LOCALS):
            return _MISSING
        try:
            return mapping[name]
        except KeyError:
            return _MISSING

    def _lookup(self, frame, name, local=False):
        """What LOAD_NAME or LOAD_GLOBAL finds: the frame's own names first, for LOAD_NAME, then the globals, then the built-ins."""
        places = ([frame.f_locals] if local else []) + [frame.f_globals, frame.f_builtins]
        for mapping in places:
            value = self._read(mapping, name)
            if value is not _MISSING:
                return value
        return _MISSING

    def _attribute(self, owner_label, name, method):
        """What LOAD_ATTR puts on the plates, an object or None for an empty plate each, if it can be told without running code."""
        owner = self.objects.get(owner_label)
        if owner is _MISSING:
            return None
        kind = type(owner)
        if kind is types.ModuleType:
            value = types.ModuleType.__dict__["__dict__"].__get__(owner).get(name, _MISSING)
            return None if value is _MISSING else _found(value, method)
        if kind is type:
            if _class_lookup(type, name) is not _MISSING:
                return None
            value = _class_lookup(owner, name)
            plain = value is not _MISSING and (type(value) is types.FunctionType or _class_lookup(type(value), "__get__") is _MISSING)
            return _found(value, method) if plain else None
        if _class_lookup(kind, "__getattribute__") is not _OBJECT_GETATTRIBUTE:
            return None
        found = _class_lookup(kind, name)
        if found is not _MISSING and (_class_lookup(type(found), "__set__") is not _MISSING or _class_lookup(type(found), "__delete__") is not _MISSING):
            return None
        own = _instance_dict(owner)
        if own is not None and name in own:
            return _found(own[name], method)
        if found is _MISSING:
            return None
        if method and type(found) in (types.FunctionType, types.MethodDescriptorType):
            return [found, owner]
        if _class_lookup(type(found), "__get__") is _MISSING:
            return _found(found, method)
        return None

    def facts(self, runs):
        """The plates, variables, frames and objects, as the Analysis records them."""
        for run in runs:
            run.pop("index", None)
            for change in run.get("plates", []):
                change["put"] = [label.fact() for label in change["put"]]
            for change in run.get("variables", []):
                if "value" in change:
                    change["value"] = change["value"].fact()
        return {"frames": self.frames, "objects": self.objects.facts}


def _found(value, method):
    """What LOAD_ATTR puts on the plates for an attribute that isn't a method: the attribute, then, ready for a call, an empty plate."""
    return [value, None] if method else [value]


def _class_lookup(kind, name):
    """What a class, or the first of its bases that has it, holds under a name, read from their own dictionaries."""
    for klass in type.__dict__["__mro__"].__get__(kind):
        namespace = type.__dict__["__dict__"].__get__(klass)
        if name in namespace:
            return namespace[name]
    return _MISSING


def _instance_dict(owner):
    """An object's own dictionary of attributes, if Python's own code keeps one for it."""
    found = _class_lookup(type(owner), "__dict__")
    if type(found) is not types.GetSetDescriptorType:
        return None
    own = found.__get__(owner, type(owner))
    return own if type(own) is dict else None


def _is_dunder(name):
    return name.startswith("__") and name.endswith("__")


# Showing a value without running the learner's code

_REPR_LENGTH = 80
_ITEMS_SHOWN = 20
_ATOMS = (int, float, complex, bool, str, bytes, bytearray, range, type(None), type(...))
_BRACKETS = {list: "[]", tuple: "()", set: "{}", frozenset: "{}", dict: "{}"}


def _safe_repr(value):
    """
    The value as Python's repr shows it, cut short to 80 characters. Only Python's own types are shown that way,
    checked by exact type, which no object can fake. Any other object would run its class's code to show itself, so
    it is named by its class instead: <Point object>.
    """
    text = _repr(value, 0)
    return text if len(text) <= _REPR_LENGTH else text[:_REPR_LENGTH - 1] + "…"


def _class_name(kind):
    """A class's name, read straight from Python's record of it, so no code of the class can run."""
    return type.__dict__["__qualname__"].__get__(kind)


def _repr(value, depth):
    kind = type(value)
    if kind in _ATOMS:
        try:
            # Long strings are cut short anyway; a huge int may be too long for Python to convert at all.
            return repr(value[:_REPR_LENGTH]) if kind is str and len(value) > _REPR_LENGTH else repr(value)
        except ValueError:
            pass
    elif kind in _BRACKETS:
        return _repr_container(value, depth)
    elif kind in (types.FunctionType, types.BuiltinFunctionType):
        return f"<function {value.__qualname__}>"
    elif kind is type:
        return f"<class '{_class_name(value)}'>"
    elif kind is types.ModuleType:
        return f"<module '{value.__dict__.get('__name__', '?')}'>"
    return f"<{_class_name(kind)} object>"


def _repr_container(value, depth):
    kind = type(value)
    opening, closing = _BRACKETS[kind]
    if depth >= 3:
        return f"{opening}…{closing}"
    if kind is dict:
        items = [f"{_repr(key, depth + 1)}: {_repr(item, depth + 1)}" for key, item in _first(value.items())]
    else:
        items = [_repr(item, depth + 1) for item in _first(value)]
    if len(value) > _ITEMS_SHOWN:
        items.append("…")
    inside = ", ".join(items)
    if kind is tuple and len(value) == 1:
        inside += ","
    if kind in (set, frozenset) and not value:
        return f"{kind.__name__}()"
    shown = f"{opening}{inside}{closing}"
    return f"frozenset({shown})" if kind is frozenset else shown


def _first(items):
    return [item for _, item in zip(range(_ITEMS_SHOWN), items)]


def _safe_exception(exception):
    """The exception as a traceback's last line shows it, for Python's own exceptions; otherwise just its class."""
    return f"{_class_name(type(exception))}: {_safe_message(exception)}".removesuffix(": ")


def _safe_message(exception):
    kind = type(exception)
    if getattr(builtins, _class_name(kind), None) is not kind or not all(type(arg) in _ATOMS for arg in exception.args):
        return ""
    return str(exception)
