"""The recorded run: what the Program printed, its Events, and the order its steps ran in."""

import dis
import json
import sys
from pathlib import Path

from analyze import RECORD_LIMIT, analyze

GREET = json.loads(
    (Path(__file__).parents[2] / "prototype" / "data" / "example-greet-cpython-3.14.2.json").read_text("utf-8")
)


def code_names(program):
    """The qualified name of each of the Program's code objects, in the order a step run's `code` counts them."""
    names = []

    def collect(code):
        names.append(code.co_qualname)
        for const in code.co_consts:
            if hasattr(const, "co_code"):
                collect(const)

    collect(compile(program, "program.py", "exec"))
    return names


# What the Program printed

def test_hello_world_prints_hello_world():
    analysis = analyze('print("Hello World!")')

    assert analysis["stdout"] == "Hello World!\n"
    assert analysis["stderr"] == ""
    assert analysis["error"] is None


def test_everything_a_multi_line_program_prints_is_kept_in_order():
    analysis = analyze('for name in ["Ada", "Grace"]:\n    print("Hello,", name)\nprint("Bye")')

    assert analysis["stdout"] == "Hello, Ada\nHello, Grace\nBye\n"


def test_stdout_and_stderr_are_kept_apart():
    analysis = analyze('import sys\nprint("one")\nprint("two", file=sys.stderr)\nprint("three")')

    assert analysis["stdout"] == "one\nthree\n"
    assert analysis["stderr"] == "two\n"


def test_an_error_stops_the_program_and_its_traceback_goes_to_stderr(working_folder):
    analysis = analyze('print("before")\n1 / 0')

    path = str(working_folder / "program.py")
    assert analysis["stdout"] == "before\n"
    assert analysis["stderr"] == (
        "Traceback (most recent call last):\n"
        f'  File "{path}", line 2, in <module>\n'
        "    1 / 0\n"
        "    ~~^~~\n"
        "ZeroDivisionError: division by zero\n"
    )
    assert analysis["error"] == {"type": "ZeroDivisionError", "message": "division by zero", "line": 2}


def test_an_error_inside_a_function_is_placed_on_the_line_that_raised_it():
    analysis = analyze("def f():\n    return [][1]\n\nf()")

    assert analysis["error"] == {"type": "IndexError", "message": "list index out of range", "line": 2}


def test_an_import_python_cant_find_names_the_module_and_whether_it_is_in_the_standard_library():
    analysis = analyze("import math\nimport no_such_package")

    assert analysis["error"] == {
        "type": "ModuleNotFoundError", "message": "No module named 'no_such_package'", "line": 2, "module": "no_such_package", "standardLibrary": False,
    }
    assert analyze("import xml.nothing")["error"]["standardLibrary"] is True
    # The Program's own ModuleNotFoundError names no module.
    assert "module" not in analyze('raise ModuleNotFoundError("mine")')["error"]


def test_a_syntax_error_stops_the_program_before_anything_runs():
    analysis = analyze('print("Hi"')

    assert analysis["error"] == {"type": "SyntaxError", "message": "'(' was never closed", "line": 1, "start": {"line": 1, "column": 5}}
    assert analysis["stdout"] == ""
    assert analysis["stderr"].endswith("SyntaxError: '(' was never closed\n")
    assert analysis["events"] == []
    assert analysis["runs"] == []


def test_a_syntax_error_names_the_code_python_points_at_counting_characters():
    # é is two bytes, but one character, as tokenize counts columns. The colon belongs where the newline is.
    assert analyze('x = "é" +')["error"]["start"] == {"line": 1, "column": 9}
    analysis = analyze('for c in "é"\n    print(c)')

    assert analysis["error"] == {
        "type": "SyntaxError", "message": "expected ':'", "line": 1, "start": {"line": 1, "column": 12}, "end": {"line": 1, "column": 13},
    }
    assert analyze("if x = 1:\n    pass")["error"]["end"] == {"line": 1, "column": 8}


def test_an_indentation_error_is_a_syntax_error_with_no_end():
    analysis = analyze("x = 1\n    y = 2")

    assert analysis["error"] == {"type": "IndentationError", "message": "unexpected indent", "line": 2, "start": {"line": 2, "column": 3}}


def test_a_syntax_error_raised_while_the_program_runs_is_placed_where_the_program_raised_it():
    analysis = analyze('x = 1\neval("1 +")')

    assert analysis["error"] == {"type": "SyntaxError", "message": "invalid syntax", "line": 2}


def test_sys_exit_is_not_an_error():
    assert analyze("import sys\nsys.exit(3)")["error"] is None

    analysis = analyze('raise SystemExit("bye")')
    assert analysis["error"] is None
    assert analysis["stderr"] == "bye\n"


def test_the_run_prints_what_the_try_it_yourself_command_prints():
    analysis = analyze('print("Hi")\nprint(1 / 0)', "program.py", ["python program.py"])

    assert analysis["stdout"] + analysis["stderr"] == analysis["commands"][0]["output"]


# Blocked modules

def test_importing_js_stops_the_program_with_a_message_that_says_it_is_blocked(working_folder):
    analysis = analyze('print("before")\nimport js')

    path = str(working_folder / "program.py")
    assert analysis["stdout"] == "before\n"
    # The traceback reads like Python's own: it passes through the Program's file and nothing of the analyzer's.
    assert analysis["stderr"] == (
        "Traceback (most recent call last):\n"
        f'  File "{path}", line 2, in <module>\n'
        "    import js\n"
        "ModuleNotFoundError: js is blocked here, so a program can't use your browser\n"
    )
    assert analysis["error"] == {
        "type": "ModuleNotFoundError", "message": "js is blocked here, so a program can't use your browser", "line": 2,
        "module": "js", "standardLibrary": False, "blocked": True,
    }


def test_js_pyodide_pyodide_js_and_micropip_are_blocked_however_they_are_imported():
    for program in ["from js import fetch", "import pyodide.ffi", "import pyodide_js", "import micropip", '__import__("js")',
                    'import importlib\nimportlib.import_module("pyodide")', "def f():\n    import js\nf()", 'exec("import js", {})']:
        error = analyze(program)["error"]
        assert error["type"] == "ModuleNotFoundError", program
        assert error["blocked"] is True, program


def test_try_it_yourself_commands_are_blocked_too():
    analysis = analyze("import js", commands=["python program.py"])

    assert analysis["commands"][0]["output"].endswith("ModuleNotFoundError: js is blocked here, so a program can't use your browser\n")


def test_other_imports_work_and_are_not_marked_blocked():
    import builtins
    import importlib

    original = builtins.__import__, importlib.import_module
    assert analyze("import json\nfrom os import path\nimport importlib\nimportlib.import_module('math')")["error"] is None
    assert "blocked" not in analyze("import no_such_package")["error"]
    # The block lasts only while code runs.
    assert (builtins.__import__, importlib.import_module) == original


# Step runs: the order the steps ran in

def test_for_greet_py_the_step_runs_match_the_capture_of_prototype_v8():
    analysis = analyze(GREET["source"], GREET["file"])
    names = code_names(GREET["source"])

    runs = [{"code": names[run["code"]], "off": run["offset"], **({"printed": run["printed"]} if "printed" in run else {})}
            for run in analysis["runs"]]
    # sys.monitoring doesn't report RESUME, so the capture has no RESUME; the analyzer adds it where each code object starts.
    resumes = [run for run in runs if run["off"] == 0]
    assert [run for run in runs if run["off"] != 0] == GREET["ran"]
    assert resumes == [{"code": "<module>", "off": 0}, {"code": "greet", "off": 0}, {"code": "greet", "off": 0}]
    assert len(runs) == 42
    assert runs[0] == {"code": "<module>", "off": 0}
    # CALL greet, then greet's RESUME.
    assert runs[11:13] == [{"code": "<module>", "off": 24}, {"code": "greet", "off": 0}]


def test_each_step_run_is_a_fact_numbered_in_the_order_the_steps_ran():
    runs = analyze("x = 1")["runs"]

    assert [run["id"] for run in runs] == [f"run-{n}" for n in range(len(runs))]
    assert runs[0] == {"id": "run-0", "code": 0, "offset": 0, "frame": 0, "caller": None}


def test_a_generator_runs_its_resume_step_each_time_it_carries_on():
    program = "def count():\n    yield 1\n    yield 2\n\nfor n in count():\n    pass"
    analysis = analyze(program)

    count = code_names(program).index("count")
    generator = compile(program, "program.py", "exec").co_consts[0]
    resumes = [step.offset for step in dis.get_instructions(generator) if step.opname == "RESUME"]
    ran = [run["offset"] for run in analysis["runs"] if run["code"] == count]
    assert [offset for offset in ran if offset in resumes] == resumes


def test_each_line_of_output_is_tied_to_the_step_run_that_printed_it():
    analysis = analyze('for n in range(3):\n    print(n)\nprint("end")')

    printed = [run for run in analysis["runs"] if "printed" in run]
    assert [run["printed"] for run in printed] == ["0\n", "1\n", "2\n", "end\n"]
    assert "".join(run["printed"] for run in printed) == analysis["stdout"]


# Events

def test_events_record_each_call_line_and_return_with_the_variables_at_that_moment():
    analysis = analyze("def double(n):\n    return n * 2\n\nx = double(3)")

    module, double = 0, code_names("def double(n):\n    return n * 2\n\nx = double(3)").index("double")
    assert analysis["events"] == [
        {"id": "ev-0", "kind": "call", "code": module, "line": 1, "locals": {}},
        {"id": "ev-1", "kind": "line", "code": module, "line": 1, "locals": {}},
        {"id": "ev-2", "kind": "line", "code": module, "line": 4, "locals": {"double": "<function double>"}},
        {"id": "ev-3", "kind": "call", "code": double, "line": 1, "locals": {"n": "3"}},
        {"id": "ev-4", "kind": "line", "code": double, "line": 2, "locals": {"n": "3"}},
        {"id": "ev-5", "kind": "return", "code": double, "line": 2, "locals": {"n": "3"}, "value": "6"},
        {"id": "ev-6", "kind": "return", "code": module, "line": 4, "locals": {"double": "<function double>", "x": "6"}, "value": "None"},
    ]


def test_an_exception_is_an_event_and_the_frame_it_ends_returns_without_a_value():
    events = analyze("x = 1\n1 / 0")["events"]

    assert events[-2] == {"id": "ev-3", "kind": "exception", "code": 0, "line": 2, "locals": {"x": "1"}, "value": "ZeroDivisionError: division by zero"}
    assert events[-1] == {"id": "ev-4", "kind": "return", "code": 0, "line": 2, "locals": {"x": "1"}}


def locals_after(program):
    return analyze(program)["events"][-1]["locals"]


def test_values_are_shown_as_python_shows_them():
    assert locals_after("a = [1, 'b', (2,), {3}]\nd = {'z': 1, 'y': None}\nt = (True, 2.5, b'x')") == {
        "a": "[1, 'b', (2,), {3}]",
        "d": "{'z': 1, 'y': None}",
        "t": "(True, 2.5, b'x')",
    }


def test_values_that_would_run_other_code_to_show_are_named_by_their_kind():
    program = (
        "import math\n"
        "class Point:\n"
        "    def __repr__(self):\n"
        "        print('repr ran')\n"
        "        return 'P'\n"
        "p = [Point()]"
    )
    analysis = analyze(program)

    assert analysis["events"][-1]["locals"] == {"math": "<module 'math'>", "Point": "<class 'Point'>", "p": "[<Point object>]"}
    assert analysis["stdout"] == ""


def test_long_values_are_cut_short():
    shown = locals_after('s = "' + "a" * 500 + '"\nn = list(range(100))')

    assert len(shown["s"]) == 80
    assert shown["s"].endswith("…")
    assert shown["n"].startswith("[0, 1, 2")
    assert len(shown["n"]) <= 80


# The 2,000 limit

def test_a_long_run_keeps_the_first_2000_events_and_step_runs_and_says_so():
    analysis = analyze('for i in range(5000):\n    pass\nprint("done")')

    assert RECORD_LIMIT == 2000
    assert len(analysis["runs"]) == 2000
    assert len(analysis["events"]) == 2000
    assert analysis["runsCutShort"] is True
    assert analysis["eventsCutShort"] is True
    # The Program still runs to the end; output after the cut isn't tied to a step run.
    assert analysis["stdout"] == "done\n"
    assert not any("printed" in run for run in analysis["runs"])


def test_a_short_run_is_recorded_in_full():
    analysis = analyze('print("Hi")')

    assert analysis["runsCutShort"] is False
    assert analysis["eventsCutShort"] is False


def test_recording_leaves_python_as_it_was():
    analyze("def f():\n    yield 1\nlist(f())\n1 / 0")

    assert all(sys.monitoring.get_tool(tool) is None for tool in range(6))


def test_a_one_line_loop_has_a_line_event_each_time_round_as_sys_settrace_reports():
    events = analyze("i = 0\nwhile i < 3: i += 1")["events"]

    assert [event["line"] for event in events if event["kind"] == "line"] == [1, 2, 2, 2, 2]


def test_a_generator_carrying_on_after_a_yield_is_a_call_on_the_line_it_carries_on_from():
    events = analyze("def count():\n    yield 1\n    yield 2\n\nfor n in count():\n    pass")["events"]

    assert [event["line"] for event in events if event["kind"] == "call" and event["code"] == 1] == [1, 2, 3]


def test_an_object_that_pretends_to_be_a_function_is_still_named_by_its_class():
    program = (
        "import types\n"
        "class Sneaky:\n"
        "    @property\n"
        "    def __class__(self):\n"
        "        print('property ran')\n"
        "        return types.FunctionType\n"
        "s = Sneaky()"
    )
    analysis = analyze(program)

    assert analysis["events"][-1]["locals"]["s"] == "<Sneaky object>"
    assert analysis["stdout"] == ""


# Input, and the clock

def test_input_returns_an_empty_string_as_if_enter_were_pressed_with_nothing_typed():
    analysis = analyze('name = input("Name? ")\nprint(repr(name))')

    assert analysis["stdout"] == "Name? ''\n"
    assert analysis["error"] is None
    assert analysis["stdinReads"] == 1


def test_each_read_from_standard_input_is_counted():
    analysis = analyze("import sys\nfor _ in range(3):\n    input()\nsys.stdin.readline()")

    assert analysis["stdinReads"] == 4


def test_reading_standard_input_to_the_end_finds_nothing_so_it_ends():
    analysis = analyze("import sys\nprint(repr(sys.stdin.read()), sys.stdin.readlines(), [line for line in sys.stdin])")

    assert analysis["stdout"] == "'' [] []\n"


def test_reading_standard_input_in_a_for_loop_or_with_readlines_counts_as_a_read():
    assert analyze("import sys\nfor line in sys.stdin:\n    pass\nsys.stdin.readlines()")["stdinReads"] == 2


def test_a_program_that_reads_no_input_reads_none():
    assert analyze('print("Hi")')["stdinReads"] == 0


def test_a_try_it_yourself_run_gets_empty_input_too():
    analysis = analyze('print(repr(input("Name? ")))', commands=["python program.py"])

    assert analysis["commands"][0]["output"] == "Name? ''\n"


def test_the_clock_runs_only_while_code_runs_once_for_the_program_and_once_for_each_command():
    ticks = []
    analyze('print("Hi")', commands=["python program.py", "python -m dis program.py"], clock=ticks.append)

    assert ticks == [True, False] * 3


def test_the_clock_stops_when_the_program_stops_with_an_error():
    ticks = []
    analyze("1 / 0", clock=ticks.append)

    assert ticks == [True, False]
