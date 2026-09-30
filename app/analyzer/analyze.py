"""The analyzer: turns a Program into an Analysis, the Facts the zoom view shows.

It runs inside Pyodide in the learner's browser, and under CPython for the tests.
The shape of its output is defined by schema/analysis.schema.json.
"""

import platform


def analyze(code):
    # Code editors save a file with a newline at the end, so the Program always has one.
    program = code if code.endswith("\n") else code + "\n"
    return {
        "pythonVersion": platform.python_version(),
        "program": program,
        "bytes": _bytes(program),
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
