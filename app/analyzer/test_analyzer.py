import os
import sys

import pytest

from analyze import analyze


def test_hello_world_is_22_bytes_from_p_to_the_newline():
    analysis = analyze('print("Hello World!")')

    values = [b["value"] for b in analysis["bytes"]]
    assert len(values) == 22
    assert values[0] == 112  # p
    assert values[-1] == 10  # the newline the editor adds when it saves


def test_a_program_that_already_ends_with_a_newline_gets_no_second_one():
    analysis = analyze('print("Hello World!")\n')

    assert [b["value"] for b in analysis["bytes"]][-2:] == [41, 10]  # ) then the newline
    assert len(analysis["bytes"]) == 22


def test_each_byte_is_a_fact_linked_to_the_character_it_encodes():
    # é takes two bytes in UTF-8, 0xC3 0xA9; both belong to character 5.
    analysis = analyze('s = "é"')

    assert analysis["bytes"][4:8] == [
        {"id": "byte-4", "value": 0x22, "charIndex": 4, "line": 1},
        {"id": "byte-5", "value": 0xC3, "charIndex": 5, "line": 1},
        {"id": "byte-6", "value": 0xA9, "charIndex": 5, "line": 1},
        {"id": "byte-7", "value": 0x22, "charIndex": 6, "line": 1},
    ]
    assert analysis["bytes"][0]["id"] == "byte-0"


def test_every_line_ends_in_a_newline_byte_that_belongs_to_that_line():
    analysis = analyze("a = 1\nb = 2\nprint(a + b)")

    newlines = [b for b in analysis["bytes"] if b["value"] == 10]
    assert [b["line"] for b in newlines] == [1, 2, 3]
    assert newlines[-1] == analysis["bytes"][-1]


def test_the_analysis_carries_the_program_as_a_saved_file():
    assert analyze("x = 1")["program"] == "x = 1\n"


# Try it yourself: each command runs for real, on the Program saved under the learner's file name.

BYTES_COMMAND = "python -c \"print(list(open('program.py', 'rb').read()))\""


def run_command(code, command, tmp_path):
    analysis = analyze(code, "program.py", [command], str(tmp_path))
    assert analysis["fileName"] == "program.py"
    return analysis["commands"][0]


def test_the_bytes_command_prints_the_programs_bytes(tmp_path):
    result = run_command('print("Hi")', BYTES_COMMAND, tmp_path)

    assert result == {
        "command": BYTES_COMMAND,
        "output": "[112, 114, 105, 110, 116, 40, 34, 72, 105, 34, 41, 10]\n",
        "exitStatus": 0,
    }


def test_running_the_file_shows_what_the_program_printed_in_order(tmp_path):
    code = 'import sys\nprint("one")\nprint("two", file=sys.stderr)\nprint("three")'

    result = run_command(code, "python program.py", tmp_path)

    # A terminal shows stdout and stderr together, in the order they were written.
    assert result["output"] == "one\ntwo\nthree\n"
    assert result["exitStatus"] == 0


def test_the_program_sees_itself_run_as_a_file_called_by_its_name(tmp_path):
    code = "import sys\nprint(__name__, sys.argv)\nprint(__file__ == sys.modules['__main__'].__file__)"

    result = run_command(code, "python program.py", tmp_path)

    assert result["output"] == "__main__ ['program.py']\nTrue\n"


def test_the_program_runs_in_a_main_module_like_the_one_python_makes_for_a_file(tmp_path):
    code = "print(__cached__, __spec__, type(__loader__).__name__, __loader__.path == __file__)"

    assert run_command(code, "python program.py", tmp_path)["output"] == "None None SourceFileLoader True\n"


def test_the_commands_run_in_the_working_folder_unless_told_otherwise(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    analysis = analyze("print(__file__)", "program.py", ["python program.py"])

    assert analysis["commands"][0]["output"] == f"{tmp_path / 'program.py'}\n"


def test_an_error_prints_a_traceback_of_the_program_alone(tmp_path):
    result = run_command('print("before")\n1 / 0', "python program.py", tmp_path)

    path = str(tmp_path / "program.py")
    assert result["output"] == (
        "before\n"
        "Traceback (most recent call last):\n"
        f'  File "{path}", line 2, in <module>\n'
        "    1 / 0\n"
        "    ~~^~~\n"
        "ZeroDivisionError: division by zero\n"
    )
    assert result["exitStatus"] == 1


def test_a_syntax_error_is_reported_as_python_reports_it(tmp_path):
    result = run_command('print("Hi"', "python program.py", tmp_path)

    path = str(tmp_path / "program.py")
    assert result["output"] == (
        f'  File "{path}", line 1\n'
        '    print("Hi"\n'
        "         ^\n"
        "SyntaxError: '(' was never closed\n"
    )
    assert result["exitStatus"] == 1


def test_sys_exit_sets_the_exit_status_and_prints_a_message(tmp_path):
    assert run_command("import sys\nsys.exit(3)", "python program.py", tmp_path) == {
        "command": "python program.py",
        "output": "",
        "exitStatus": 3,
    }
    assert run_command('raise SystemExit("bye")', "python program.py", tmp_path)["output"] == "bye\n"
    assert run_command('raise SystemExit("bye")', "python program.py", tmp_path)["exitStatus"] == 1


def test_running_a_program_leaves_python_as_it_was(tmp_path):
    before = (sys.stdout, sys.stderr, list(sys.argv), list(sys.path), sys.modules["__main__"], os.getcwd())

    run_command("import sys, os\nsys.argv.append('x')\nos.chdir('/')\nprint(1)", "python program.py", tmp_path)

    assert (sys.stdout, sys.stderr, sys.argv, sys.path, sys.modules["__main__"], os.getcwd()) == before
    assert not (tmp_path / "program.py").exists()


def test_without_commands_the_analysis_has_none():
    assert analyze("x = 1")["commands"] == []


def test_a_command_the_analyzer_cant_run_is_refused(tmp_path):
    with pytest.raises(ValueError, match="can’t run node program.py"):
        analyze("x = 1", "program.py", ["node program.py"], str(tmp_path))
