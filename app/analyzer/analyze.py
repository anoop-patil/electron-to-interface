"""The analyzer: turns a Program into an Analysis, the Facts the zoom view shows.

It runs inside Pyodide in the learner's browser, and under CPython for the tests.
The shape of its output is defined by schema/analysis.schema.json.
"""

import builtins
import importlib.machinery
import io
import os
import platform
import shlex
import sys
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
    return {
        "pythonVersion": platform.python_version(),
        "program": program,
        "fileName": file_name,
        "bytes": _bytes(program),
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
        compiled = compile(source, file_name, "exec")
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
    """Does what `python FILE` or `python -c CODE` does, in `folder`, and returns what a terminal shows."""
    words = shlex.split(command)
    if len(words) >= 3 and words[:2] == ["python", "-c"]:
        source, file_name, argv, path_entry, main = words[2], "<string>", ["-c", *words[3:]], "", _main_module()
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
