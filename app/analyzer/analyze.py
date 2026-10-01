"""The analyzer: turns a Program into an Analysis, the Facts the zoom view shows.

It runs inside Pyodide in the learner's browser, and under CPython for the tests.
The shape of its output is defined by schema/analysis.schema.json.
"""

import ast
import builtins
import codecs
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

# The most Events, and the most step runs, the Analysis records. A longer run is cut short, and the Analysis says so.
RECORD_LIMIT = 2000


def analyze(code, file_name="program.py", commands=(), folder=None):
    """
    Runs the Program once, saved as `file_name` in `folder` (the working folder if None), recording what it printed,
    its Events and the order its steps ran in. `commands` are Try it yourself commands, such as `python program.py`:
    each runs on the same file, and the Analysis records what it printed.
    """
    # Code editors save a file with a newline at the end, so the Program always has one.
    program = code if code.endswith("\n") else code + "\n"
    folder = folder or os.getcwd()
    path = os.path.join(folder, file_name)
    with open(path, "wb") as file:
        file.write(program.encode("utf-8"))
    try:
        recorded = _record_run(file_name, folder)
        command_runs = [_run_command(command, folder) for command in commands]
    finally:
        os.remove(path)
    encoding, tokens = _tokens(program)
    return {
        "pythonVersion": platform.python_version(),
        "program": program,
        "fileName": file_name,
        "bytes": _bytes(program),
        "encoding": encoding,
        "tokens": tokens,
        "ast": _syntax_tree(program, encoding),
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
    byte_at = _byte_positions(raw, encoding)
    lines = raw.decode(encoding).split("\n")

    def position(line, column):
        # ast counts columns in the UTF-8 bytes of the text it decoded; tokenize, and so byte_at, counts characters.
        return byte_at(line, len(lines[line - 1].encode("utf-8")[:column].decode("utf-8")))

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
    # Python frees a node by freeing the nodes inside it first, one call inside another. For a deep tree that runs
    # out of the browser's stack and stops Pyodide for good, so each node is emptied first and freed on its own.
    for node, _, _ in order:
        for name in node._fields:
            setattr(node, name, None)
    return facts


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


# Running the Program as Python runs a file

def _main_module(file_name=None):
    """The module Python makes for the program it runs: for a file, it also records the file."""
    main = types.ModuleType("__main__")
    main.__builtins__ = builtins
    if file_name:
        main.__file__, main.__cached__ = file_name, None
        main.__loader__ = importlib.machinery.SourceFileLoader("__main__", file_name)
    return main


def _run_as_main(source, file_name, argv, path_entry, main, folder, stdout, stderr, recorder=None):
    """
    Does what `python` does with a program: runs it as __main__, in `folder`, with stdout and stderr going where
    they're told, and returns its exit status and the error that stopped it, if any. It runs in this Python, not a
    new one, so anything the analyzer or an earlier Run imported is already imported.
    """
    saved = (sys.stdout, sys.stderr, sys.argv, list(sys.path), sys.modules["__main__"], os.getcwd())
    sys.stdout, sys.stderr = stdout, stderr
    sys.argv = argv
    sys.path.insert(0, path_entry)
    sys.modules["__main__"] = main
    os.chdir(folder)
    try:
        compiled = source if isinstance(source, types.CodeType) else compile(source, file_name, "exec")
        if recorder:
            recorder.start(compiled)
        try:
            exec(compiled, main.__dict__)
        finally:
            if recorder:
                recorder.stop()
        return 0, None
    except SystemExit as exit:
        return _exit_status(exit, stderr), None
    except BaseException as error:
        # Leave out this function's own frame, so the traceback starts in the learner's file, as Python's does.
        tb = error.__traceback__.tb_next
        traceback.print_exception(type(error), error, tb, file=stderr)
        return 1, error
    finally:
        sys.stdout, sys.stderr, sys.argv, sys.path[:], sys.modules["__main__"], cwd = saved
        os.chdir(cwd)


def _exit_status(exit, stderr):
    """What Python does with sys.exit(code): a number is the exit status; anything else is printed, and the status is 1."""
    if exit.code is None:
        return 0
    if isinstance(exit.code, int):
        return exit.code
    print(exit.code, file=stderr)
    return 1


def _run_command(command, folder):
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
        argv, path_entry, main = words[1:], folder, _main_module(file_name)
    else:
        raise ValueError(f"The analyzer can’t run {command}")

    # A terminal shows stdout and stderr together, in the order they were written.
    terminal = io.StringIO()
    status, _ = _run_as_main(source, file_name, argv, path_entry, main, folder, terminal, terminal)
    return {"command": command, "output": terminal.getvalue(), "exitStatus": status}


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

def _record_run(file_name, folder):
    """Runs the Program as `python FILE` would, recording what it printed, its Events and its step runs."""
    path = os.path.join(folder, file_name)
    with open(path, "rb") as file:
        source = file.read()
    stdout, stderr = io.StringIO(), io.StringIO()
    recorder = _Recorder(stdout)
    _, error = _run_as_main(source, path, [file_name], folder, _main_module(path), folder, stdout, stderr, recorder)
    return {
        "stdout": stdout.getvalue(),
        "stderr": stderr.getvalue(),
        "error": _error_fact(error, path),
        "events": recorder.events,
        "runs": recorder.runs,
        "eventsCutShort": recorder.events_cut_short,
        "runsCutShort": recorder.runs_cut_short,
    }


def _error_fact(error, path):
    """The error that stopped the Program: its kind, its message, and the line of the Program it happened on."""
    if error is None:
        return None
    if isinstance(error, SyntaxError):
        fact, line = {"type": type(error).__name__, "message": error.msg}, error.lineno
    else:
        fact, line = {"type": _class_name(type(error)), "message": _safe_message(error)}, None
        tb = error.__traceback__
        while tb:
            if tb.tb_frame.f_code.co_filename == path:
                line = tb.tb_lineno
            tb = tb.tb_next
    return {**fact, "line": line} if line else fact


def _code_objects(code):
    """The Program's code objects: the file's own first, then each one inside it, depth first, in the order Python stores them."""
    found = [code]
    for const in code.co_consts:
        if isinstance(const, types.CodeType):
            found.extend(_code_objects(const))
    return found


class _Recorder:
    """
    Records the Program's Events and step runs while it runs, with sys.monitoring, only in the Program's own code.

    sys.settrace would turn off the INSTRUCTION events that record step runs, so Events come from the monitoring
    events sys.settrace is itself built on, used as it uses them. Recording never runs the learner's code: see _safe_repr.
    """

    _EVENTS = sys.monitoring.events
    # The monitoring events each record needs. RAISE, PY_UNWIND and PY_THROW can't be turned on for single code
    # objects, only everywhere.
    _FOR_STEP_RUNS = _EVENTS.INSTRUCTION | _EVENTS.PY_START | _EVENTS.PY_RESUME
    _FOR_EVENTS = _EVENTS.PY_START | _EVENTS.PY_RESUME | _EVENTS.LINE | _EVENTS.JUMP | _EVENTS.PY_RETURN | _EVENTS.PY_YIELD
    _FOR_EVENTS_EVERYWHERE = _EVENTS.RAISE | _EVENTS.PY_UNWIND | _EVENTS.PY_THROW

    def __init__(self, stdout):
        self.events, self.runs = [], []
        self.events_cut_short = self.runs_cut_short = False
        self._stdout = stdout
        self._printed = 0  # how much of stdout is already tied to a step run
        self._codes = {}
        self._lines = {}
        self._callbacks = {}
        self._tool = None

    def start(self, module):
        monitoring, events = sys.monitoring, self._EVENTS
        self._codes = {code: index for index, code in enumerate(_code_objects(module))}
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
            events.PY_YIELD: self._on_return,
            events.PY_UNWIND: self._on_unwind,
            events.RAISE: self._on_raise,
        }
        for event, callback in self._callbacks.items():
            monitoring.register_callback(self._tool, event, callback)
        self._update_events()

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
        sys.monitoring.set_events(self._tool, 0 if self.events_cut_short else self._FOR_EVENTS_EVERYWHERE)

    # Step runs

    def _tie_output(self):
        """Ties what was printed since the last step run began to that step run."""
        # The Program only adds to stdout, so its position is its length; reading it all at every step would be slow.
        length = self._stdout.tell()
        if length > self._printed and self.runs:
            step_run = self.runs[-1]
            step_run["printed"] = step_run.get("printed", "") + self._stdout.getvalue()[self._printed:]
        self._printed = length

    def _add_run(self, code, offset):
        if self.runs_cut_short:
            return
        self._tie_output()
        if len(self.runs) == RECORD_LIMIT:
            self.runs_cut_short = True
            self._update_events()
            return
        self.runs.append({"id": f"run-{len(self.runs)}", "code": self._codes[code], "offset": offset})

    def _on_instruction(self, code, offset):
        self._add_run(code, offset)

    # INSTRUCTION events don't report RESUME. It runs where a code object starts, or carries on after a yield, which
    # is when PY_START and PY_RESUME are reported, at its offset.

    def _on_start(self, code, offset):
        self._add_run(code, offset)
        self._add_event("call", code, line=code.co_firstlineno)

    def _on_resume(self, code, offset):
        self._add_run(code, offset)
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

    def _on_unwind(self, code, offset, exception):
        self._add_event("return", code)

    def _on_raise(self, code, offset, exception):
        self._add_event("exception", code, value=_safe_exception(exception))


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
