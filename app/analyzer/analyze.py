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


def analyze(code, file_name="program.py", commands=(), folder=None):
    """`commands` are Try it yourself commands, such as `python program.py`. Each runs on the Program,
    saved as `file_name` in `folder` (the working folder if None), and the Analysis records what it printed."""
    # Code editors save a file with a newline at the end, so the Program always has one.
    program = code if code.endswith("\n") else code + "\n"
    return {
        "pythonVersion": platform.python_version(),
        "program": program,
        "fileName": file_name,
        "bytes": _bytes(program),
        "commands": _run_commands(program, file_name, commands, folder),
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


def _run_commands(program, file_name, commands, folder):
    if not commands:
        return []
    folder = folder or os.getcwd()
    path = os.path.join(folder, file_name)
    with open(path, "wb") as file:
        file.write(program.encode("utf-8"))
    try:
        return [_run_command(command, folder) for command in commands]
    finally:
        os.remove(path)


def _run_command(command, folder):
    """
    Does what `python FILE` or `python -c CODE` does, in `folder`, and returns what a terminal shows. It runs in this
    Python, not a new one, so anything the analyzer or an earlier Run imported is already imported.
    """
    words = shlex.split(command)
    main = types.ModuleType("__main__")
    main.__builtins__ = builtins
    if len(words) >= 3 and words[:2] == ["python", "-c"]:
        source, file_name, argv, path_entry = words[2], "<string>", ["-c", *words[3:]], ""
    elif len(words) >= 2 and words[0] == "python" and not words[1].startswith("-"):
        file_name = os.path.join(folder, words[1])
        with open(file_name, "rb") as file:
            source = file.read()
        argv, path_entry = words[1:], folder
        # The module Python makes for a file it runs.
        main.__file__, main.__cached__ = file_name, None
        main.__loader__ = importlib.machinery.SourceFileLoader("__main__", file_name)
    else:
        raise ValueError(f"The analyzer can’t run {command}")

    terminal = io.StringIO()
    saved = (sys.stdout, sys.stderr, sys.argv, list(sys.path), sys.modules["__main__"], os.getcwd())
    sys.stdout = sys.stderr = terminal
    sys.argv = argv
    sys.path.insert(0, path_entry)
    sys.modules["__main__"] = main
    os.chdir(folder)
    try:
        exec(compile(source, file_name, "exec"), main.__dict__)
        status = 0
    except SystemExit as exit:
        status = _exit_status(exit, terminal)
    except BaseException as error:
        # Leave out this function's own frame, so the traceback starts in the learner's file, as Python's does.
        tb = error.__traceback__.tb_next
        traceback.print_exception(type(error), error, tb, file=terminal)
        status = 1
    finally:
        sys.stdout, sys.stderr, sys.argv, sys.path[:], sys.modules["__main__"], cwd = saved
        os.chdir(cwd)
    return {"command": command, "output": terminal.getvalue(), "exitStatus": status}


def _exit_status(exit, terminal):
    """What Python does with sys.exit(code): a number is the exit status; anything else is printed, and the status is 1."""
    if exit.code is None:
        return 0
    if isinstance(exit.code, int):
        return exit.code
    print(exit.code, file=terminal)
    return 1
