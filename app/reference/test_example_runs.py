import json

import pytest

from example_runs import LIBRARY, entry_of, example_runs, examples


def test_the_reference_library_has_the_handlers_the_gdb_captures_recorded_on_every_step_run():
    # Rebuild with `python reference/example_runs.py` after a capture or the analyzer changes.
    assert json.loads(LIBRARY.read_text("utf-8"))["examples"] == examples()


def test_a_call_names_how_it_ran():
    def run(calls=(), after="POP_TOP"):
        return {"op": "CALL", "calls": [{"fn": fn} for fn in calls], "next": f"_TAIL_CALL_{after}.llvm.1 in section .text"}

    assert entry_of(run(after="RESUME")) == "CALL/python"
    assert entry_of(run(["cfunction_vectorcall_FASTCALL_KEYWORDS"])) == "CALL/c"
    assert entry_of(run(["_Py_Specialize_Call"], after="CALL_PY_EXACT_ARGS")) == "CALL/rewrites"


def test_the_capture_must_line_up_with_the_step_runs():
    capture = {"runs": [{"op": "RESUME", "offset": 0, "calls": [], "next": "_TAIL_CALL_LOAD_NAME", "steps": []}]}

    with pytest.raises(ValueError, match="gdb recorded no handler for step run run-1"):
        example_runs('print("Hello World!")\n', capture)
