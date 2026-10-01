import json
from pathlib import Path

from jsonschema import Draft202012Validator

from analyze import analyze

SCHEMA = json.loads(
    (Path(__file__).parent.parent / "schema" / "analysis.schema.json").read_text("utf-8")
)


def test_the_analysis_of_a_program_matches_the_schema(tmp_path):
    analysis = analyze('name = "Zoë"\nfor i in range(2):\n    print(name, i)', "program.py", ["python program.py"], str(tmp_path))

    Draft202012Validator.check_schema(SCHEMA)
    Draft202012Validator(SCHEMA).validate(analysis)
