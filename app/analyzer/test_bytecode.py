"""Zoom level 5: the Program's bytecode, from dis, and what each step had become after an unwatched run."""

import json
from pathlib import Path

from analyze import analyze

GREET = json.loads(
    (Path(__file__).parents[2] / "prototype" / "data" / "example-greet-cpython-3.14.2.json").read_text("utf-8")
)


def steps_of(analysis):
    return [step for code in analysis["bytecode"] for step in code["steps"]]


def test_each_code_object_of_greet_has_the_steps_v8_captured():
    analysis = analyze(GREET["source"], "greet.py")

    assert [code["name"] for code in analysis["bytecode"]] == ["<module>", "greet"]
    for code, captured in zip(analysis["bytecode"], GREET["codes"]):
        assert [
            (step["offset"], step["opname"], step["arg"], step["line"], step["bytes"], step["caches"], step["jump"])
            for step in code["steps"]
        ] == [
            (ins["off"], ins["op"], ins["arg"], ins["line"], ins["bytes"], ins["caches"], ins["jump"])
            for ins in captured["ins"]
        ]
        assert [step["span"] and [step["span"]["start"], step["span"]["end"]] for step in code["steps"]] == [
            ins["span"] for ins in captured["ins"]
        ]


def test_steps_are_facts_numbered_across_every_code_object_in_order():
    analysis = analyze(GREET["source"])

    assert [step["id"] for step in steps_of(analysis)] == [f"bc-{n}" for n in range(26)]


def test_a_step_shows_its_argument_as_dis_does_but_names_a_code_object_without_its_address():
    module, greet = analyze(GREET["source"])["bytecode"]

    assert [step["argrepr"] for step in module["steps"][:5]] == ["", "<code object greet>", "", "greet", "('Ada', 'Grace')"]
    assert greet["steps"][1]["argrepr"] == "print + NULL"


def test_each_code_object_records_its_names_fixed_values_and_own_variables():
    module, greet = analyze(GREET["source"])["bytecode"]

    assert module["names"] == ["greet", "person"]
    assert module["consts"] == [{"code": 1}, {"value": "None"}, {"value": "('Ada', 'Grace')"}]
    assert module["varnames"] == []
    assert greet["names"] == ["print"]
    assert greet["consts"] == [{"value": "'Hello,'"}, {"value": "None"}]
    assert greet["varnames"] == ["name"]
    assert (module["size"], greet["size"]) == (GREET["codes"][0]["size_code_bytes"], GREET["codes"][1]["size_code_bytes"])


def test_after_the_unwatched_run_each_step_has_the_form_v8_captured():
    analysis = analyze(GREET["source"], "greet.py", ["python greet.py"])

    for code, captured in zip(analysis["bytecode"], GREET["after_run"].values()):
        assert {str(step["offset"]): step["afterRun"] for step in code["steps"]} == captured
    assert analysis["bytecode"][1]["steps"][4]["afterRun"] == "CALL_BUILTIN_FAST_WITH_KEYWORDS"


def test_without_the_unwatched_run_no_step_has_a_form_after_it():
    # The recorded run is watched with sys.monitoring, which stops Python rewriting steps into faster forms.
    analysis = analyze(GREET["source"], "greet.py", ["python -m dis greet.py"])

    assert all("afterRun" not in step for step in steps_of(analysis))


def test_a_code_object_that_never_ran_keeps_its_steps_as_they_were():
    analysis = analyze("def never():\n    return 1\n", "program.py", ["python program.py"])

    assert [step["afterRun"] for step in analysis["bytecode"][1]["steps"]] == ["RESUME", "LOAD_SMALL_INT", "RETURN_VALUE"]


def test_a_program_with_a_syntax_error_has_no_bytecode():
    assert analyze('print("Hi"')["bytecode"] == []
