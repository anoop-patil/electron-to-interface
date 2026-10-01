"""Zoom level 3: the Program's tokens, as tokenize finds them, and `python -m tokenize` for Try it yourself."""

import json
from pathlib import Path

from analyze import analyze

GREET = json.loads(
    (Path(__file__).parents[2] / "prototype" / "data" / "example-greet-cpython-3.14.2.json").read_text("utf-8")
)


def kinds(analysis):
    return [(token["type"], token["text"]) for token in analysis["tokens"]]


def test_hello_world_is_six_tokens():
    analysis = analyze('print("Hello World!")')

    assert kinds(analysis) == [
        ("NAME", "print"),
        ("OP", "("),
        ("STRING", '"Hello World!"'),
        ("OP", ")"),
        ("NEWLINE", "\n"),
        ("ENDMARKER", ""),
    ]


def test_each_token_is_a_fact_with_its_place_and_its_bytes():
    tokens = analyze('print("Hello World!")')["tokens"]

    assert tokens[0] == {
        "id": "tok-0",
        "type": "NAME",
        "exactType": "NAME",
        "text": "print",
        "start": {"line": 1, "column": 0},
        "end": {"line": 1, "column": 5},
        "span": {"start": 0, "end": 5},
    }
    assert tokens[1]["exactType"] == "LPAR"
    assert tokens[4]["span"] == {"start": 21, "end": 22}  # the newline, the last byte
    assert tokens[5]["span"] == {"start": 22, "end": 22}  # ENDMARKER takes up no bytes
    assert [token["id"] for token in tokens] == [f"tok-{n}" for n in range(6)]


def test_a_name_python_reserves_is_marked_as_a_keyword():
    tokens = analyze("for x in y:\n    pass")["tokens"]

    assert [token["text"] for token in tokens if token.get("keyword")] == ["for", "in", "pass"]
    assert "keyword" not in tokens[1]  # x


def test_the_encoding_python_read_the_bytes_with_is_recorded_apart_from_the_tokens():
    analysis = analyze("x = 1")

    assert analysis["encoding"] == "utf-8"
    assert "ENCODING" not in [token["type"] for token in analysis["tokens"]]


def test_columns_count_characters_but_the_span_counts_bytes():
    # ë is one character but two bytes, so the string ends at column 9 and byte 10.
    string = analyze('s = "Zoë"')["tokens"][2]

    assert (string["text"], string["end"], string["span"]) == ('"Zoë"', {"line": 1, "column": 9}, {"start": 4, "end": 10})


def test_a_program_that_names_another_encoding_gets_spans_in_the_bytes_that_encoding_read():
    # tokenize reads the UTF-8 bytes of é, 195 169, as two latin-1 characters, so the string ends at column 8.
    analysis = analyze('# coding: latin-1\ns = "é"')

    string = analysis["tokens"][4]
    assert analysis["encoding"] == "iso-8859-1"
    assert (string["text"], string["end"], string["span"]) == ('"Ã©"', {"line": 2, "column": 8}, {"start": 22, "end": 26})
    assert analysis["tokens"][5]["span"] == {"start": 26, "end": 27}  # the newline


def test_tokens_cover_every_line_with_the_tokens_that_mark_line_ends_and_indentation():
    analysis = analyze(GREET["source"])

    captured = [(t["type"], t["exact"], t["text"], t["start"], t["end"], t["span"]) for t in GREET["tokens"][1:]]
    recorded = [
        (t["type"], t["exactType"], t["text"], [t["start"]["line"], t["start"]["column"]],
         [t["end"]["line"], t["end"]["column"]], [t["span"]["start"], t["span"]["end"]])
        for t in analysis["tokens"]
    ]
    assert recorded == captured
    assert {"NEWLINE", "NL", "INDENT", "DEDENT"} <= {t["type"] for t in analysis["tokens"]}


def test_a_program_that_breaks_the_tokenizer_keeps_the_tokens_found_before_the_break():
    assert kinds(analyze('print("Hi"')) == [("NAME", "print"), ("OP", "("), ("STRING", '"Hi"'), ("NL", "\n")]


# Try it yourself: python -m runs a module as a program

def test_python_m_tokenize_lists_the_tokens_of_the_file(tmp_path):
    analysis = analyze('print("Hi")', "program.py", ["python -m tokenize program.py"], str(tmp_path))

    assert analysis["commands"][0] == {
        "command": "python -m tokenize program.py",
        "output": (
            "0,0-0,0:            ENCODING       'utf-8'        \n"
            "1,0-1,5:            NAME           'print'        \n"
            "1,5-1,6:            OP             '('            \n"
            "1,6-1,10:           STRING         '\"Hi\"'         \n"
            "1,10-1,11:          OP             ')'            \n"
            "1,11-1,12:          NEWLINE        '\\n'           \n"
            "2,0-2,0:            ENDMARKER      ''             \n"
        ),
        "exitStatus": 0,
    }


def test_python_m_runs_the_module_as_main_with_its_own_path_first_in_argv(tmp_path):
    (tmp_path / "shout.py").write_bytes(b"import sys\nprint(__name__, sys.argv[0].endswith('shout.py'), sys.argv[1:])\n")

    result = analyze("x = 1", "program.py", ["python -m shout program.py extra"], str(tmp_path))["commands"][0]

    assert result["output"] == "__main__ True ['program.py', 'extra']\n"


def test_python_m_tokenize_reports_where_the_tokenizer_broke(tmp_path):
    result = analyze('print("Hi"', "program.py", ["python -m tokenize program.py"], str(tmp_path))["commands"][0]

    assert result["output"] == "program.py:1:0: error: unexpected EOF in multi-line statement\n"
    assert result["exitStatus"] == 1
