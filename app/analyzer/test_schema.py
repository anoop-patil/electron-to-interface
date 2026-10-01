import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from analyze import analyze

SCHEMA = json.loads(
    (Path(__file__).parent.parent / "schema" / "analysis.schema.json").read_text("utf-8")
)


def test_the_analysis_of_a_program_matches_the_schema(tmp_path):
    analysis = analyze('name = "Zoë"\nfor i in range(2):\n    print(name, i)', "program.py", ["python program.py"], str(tmp_path))

    Draft202012Validator.check_schema(SCHEMA)
    Draft202012Validator(SCHEMA).validate(analysis)


@pytest.mark.parametrize("program", [
    "def f():\n    try:\n        1 / 0\n    finally:\n        pass\nf()",
    'print("Hi"',
    "def g():\n    yield 1\nfor n in g():\n    print(n)\nfor _ in range(9999):\n    pass",
    "class Oops(Exception):\n    pass\nraise Oops()",
])
def test_runs_that_fail_or_are_cut_short_match_the_schema(program):
    Draft202012Validator(SCHEMA).validate(analyze(program))
