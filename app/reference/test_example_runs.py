import json

import pytest

from example_runs import LIBRARY, copied_from, entry_of, example_runs, examples, handler_run, machine_code


def test_the_reference_library_has_the_handlers_the_gdb_captures_recorded_on_every_step_run():
    # Rebuild with `python reference/example_runs.py` after a capture or the analyzer changes.
    assert json.loads(LIBRARY.read_text("utf-8"))["examples"] == examples()


def test_the_reference_library_has_the_machine_code_of_every_handler_the_examples_ran():
    library = json.loads(LIBRARY.read_text("utf-8"))
    assert library["machineCode"] == machine_code()
    ran = {handler["entry"].split("/")[0] for example in library["examples"] for run in example["runs"] for handler in run["handlers"] if "path" in handler}
    assert ran == set(library["machineCode"]["handlers"])


def test_a_call_names_how_it_ran():
    def run(calls=(), after="POP_TOP"):
        return {"op": "CALL", "calls": [{"fn": fn} for fn in calls], "next": f"_TAIL_CALL_{after}.llvm.1 in section .text"}

    assert entry_of(run(after="RESUME")) == "CALL/python"
    assert entry_of(run(["cfunction_vectorcall_FASTCALL_KEYWORDS"])) == "CALL/c"
    assert entry_of(run(["_Py_Specialize_Call"], after="CALL_PY_EXACT_ARGS")) == "CALL/rewrites"


def test_a_handler_run_keeps_its_path_its_calls_and_the_numbers_it_changed():
    def step(pc, src=("generated_cases.c.h", 4139), value=None):
        return {"pc": pc, "src": list(src), **({"value": value} if value else {})}

    run = {
        "op": "CALL_PY_EXACT_ARGS", "next": "_TAIL_CALL_LOAD_GLOBAL.llvm.1 in section .text",
        "calls": [{"fn": "_Py_Dealloc"}, {"fn": "_Py_Dealloc"}],
        "steps": [step("a0", value=[999, 998]), step("a4", ("generated_cases.c.h", 10543)), step("a8", ("pyatomic_gcc.h", 375))],
    }

    assert handler_run(run) == {
        "entry": "CALL_PY_EXACT_ARGS",
        "path": ["a0", "a4", "a8"],
        "calls": [{"function": "_Py_Dealloc", "times": 2}],
        "values": [{"at": 0, "before": 999, "after": 998}],
    }
    # From the first line of RESUME_CHECK's code on, the path runs the code the compiler copied there.
    assert copied_from(run) == 1


def test_only_the_handler_before_a_step_that_ran_no_handler_of_its_own_ran_copied_code():
    library = json.loads(LIBRARY.read_text("utf-8"))
    copied = [(example["name"], at, handler["entry"]) for example in library["examples"] for at, run in enumerate(example["runs"]) for handler in run["handlers"] if "copied" in handler]
    # greet.py's second CALL, whose CALL_PY_EXACT_ARGS ran greet's RESUME_CHECK, in the step run after it.
    assert copied == [("greet.py", 27, "CALL_PY_EXACT_ARGS")]
    assert library["examples"][1]["runs"][28]["handlers"] == [{"entry": "RESUME_CHECK", "inside": "CALL_PY_EXACT_ARGS"}]


def test_the_capture_must_line_up_with_the_step_runs():
    capture = {"runs": [{"op": "RESUME", "offset": 0, "calls": [], "next": "_TAIL_CALL_LOAD_NAME", "steps": []}]}

    with pytest.raises(ValueError, match="gdb recorded no handler for step run run-1"):
        example_runs('print("Hello World!")\n', capture)
