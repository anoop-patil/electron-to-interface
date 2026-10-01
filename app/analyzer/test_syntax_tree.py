"""Zoom level 4: the Program's syntax tree, as ast finds it, and `python -m ast` for Try it yourself."""

import ast
import json
import re
from pathlib import Path

from analyze import analyze

GREET = json.loads(
    (Path(__file__).parents[2] / "prototype" / "data" / "example-greet-cpython-3.14.2.json").read_text("utf-8")
)


def types(analysis):
    return [node["type"] for node in analysis["ast"]]


def test_hello_world_is_a_module_holding_a_call_to_print():
    assert types(analyze('print("Hello World!")')) == ["Module", "Expr", "Call", "Name", "Constant"]


def test_each_node_is_a_fact_with_its_parent_its_fields_and_its_span():
    module, expr, call, name, constant = analyze('print("Hello World!")')["ast"]

    assert module == {
        "id": "ast-0",
        "type": "Module",
        "parent": None,
        "field": None,
        "span": None,
        "fields": [{"name": "body", "nodes": ["ast-1"], "list": True}],
    }
    assert call["fields"] == [
        {"name": "func", "nodes": ["ast-3"], "list": False},
        {"name": "args", "nodes": ["ast-4"], "list": True},
    ]
    assert name == {
        "id": "ast-3",
        "type": "Name",
        "parent": "ast-2",
        "field": "func",
        "span": {"start": 0, "end": 5},
        "fields": [{"name": "id", "value": "'print'"}, {"name": "ctx", "value": "Load()"}],
    }
    assert constant["fields"] == [{"name": "value", "value": "'Hello World!'"}]
    assert constant["span"] == {"start": 6, "end": 20}
    assert expr["span"] == {"start": 0, "end": 21}


def test_the_tree_matches_the_capture_of_prototype_v8():
    analysis = analyze(GREET["source"])

    captured = [
        (f"ast-{index}", node["type"], None if node["parent"] is None else f"ast-{node['parent']}", node["field"],
         [[field, f"ast-{kid}"] for field, kid in node["kids"]])
        for index, node in enumerate(GREET["ast"])
    ]
    recorded = [
        (node["id"], node["type"], node["parent"], node["field"],
         [[field["name"], kid] for field in node["fields"] for kid in field.get("nodes", [])])
        for node in analysis["ast"]
    ]
    assert recorded == captured
    # v8 gave the nodes Python records no place for, Module and arguments, the whole file; the Analysis gives them none.
    for node, capture in zip(analysis["ast"], GREET["ast"]):
        expected = None if node["type"] in ("Module", "arguments") else {"start": capture["span"][0], "end": capture["span"][1]}
        assert node["span"] == expected, node["id"]


def test_a_multi_line_program_nests_each_body_inside_its_function_or_loop():
    tree = {node["id"]: node for node in analyze(GREET["source"])["ast"]}

    function, loop = (tree[kid] for kid in tree["ast-0"]["fields"][0]["nodes"])
    assert (function["type"], loop["type"]) == ("FunctionDef", "For")
    assert function["fields"][0] == {"name": "name", "value": "'greet'"}
    assert [tree[kid]["type"] for field in loop["fields"] if field["name"] == "body" for kid in field["nodes"]] == ["Expr"]


def test_markers_such_as_load_and_add_are_values_of_their_node_not_nodes_of_their_own():
    analysis = analyze("x = 1 + 2")

    assert types(analysis) == ["Module", "Assign", "Name", "BinOp", "Constant", "Constant"]
    binop = analysis["ast"][3]
    assert [field["name"] for field in binop["fields"]] == ["left", "op", "right"]
    assert binop["fields"][1] == {"name": "op", "value": "Add()"}


def test_fields_that_hold_nothing_are_left_out_as_python_m_ast_leaves_them_out():
    function = analyze("def f():\n    pass")["ast"][1]

    # decorator_list, returns, type_comment and type_params are empty; args holds an empty arguments box.
    assert [field["name"] for field in function["fields"]] == ["name", "args", "body"]
    assert analyze("x = None")["ast"][3]["fields"] == [{"name": "value", "value": "None"}]


def test_spans_count_bytes_though_ast_counts_columns_in_utf8_bytes_of_the_decoded_text():
    constant = analyze('s = "Zoë"')["ast"][3]
    assert constant["span"] == {"start": 4, "end": 10}

    # tokenize and ast read the UTF-8 bytes of é as two latin-1 characters, which ast counts as four UTF-8 bytes.
    constant = analyze('# coding: latin-1\ns = "é"\nt = 1')["ast"][3]
    assert constant["span"] == {"start": 22, "end": 26}


def test_a_program_with_a_syntax_error_has_no_tree():
    assert analyze('print("Hi"')["ast"] == []


# Try it yourself: python -m ast

def test_python_m_ast_prints_the_tree_of_the_file(tmp_path):
    result = analyze('print("Hi")', "program.py", ["python -m ast program.py"], str(tmp_path))["commands"][0]

    assert result == {
        "command": "python -m ast program.py",
        "output": (
            "Module(\n"
            "   body=[\n"
            "      Expr(\n"
            "         value=Call(\n"
            "            func=Name(id='print', ctx=Load()),\n"
            "            args=[\n"
            "               Constant(value='Hi')]))])\n"
        ),
        "exitStatus": 0,
    }


def test_python_m_ast_names_the_boxes_in_the_same_order_as_the_tree(tmp_path):
    program = "def f(a, b=2):\n    return [a * b for _ in range(3) if not a < b]\ndef g():\n    pass\nprint(f(1), sep='')"
    analysis = analyze(program, "program.py", ["python -m ast program.py"], str(tmp_path))

    # Every name followed by brackets is a box, except the markers: Load(), Mult(), Not(), Lt() and the like. Pass() and
    # an empty arguments() are boxes, though nothing is inside their brackets.
    markers = {name for name in dir(ast) if isinstance(getattr(ast, name), type) and issubclass(getattr(ast, name), ast.AST)
               and not getattr(ast, name)._fields and not getattr(ast, name)._attributes}
    printed = [name for name in re.findall(r"\b([A-Za-z_]+)\(", analysis["commands"][0]["output"]) if name not in markers]
    assert {"Pass", "arguments"} <= set(printed)
    assert printed == types(analysis)


def test_a_long_expression_on_one_line_gets_its_whole_tree():
    # 1,200 terms nest 1,200 BinOps deep, more than Python lets a function call itself.
    analysis = analyze("print(" + "+".join(["1"] * 1200) + ")")

    tree = analysis["ast"]
    assert types(analysis).count("BinOp") == 1199
    # The deepest BinOp holds the first two 1s; each BinOp above it adds one more, on its right.
    deepest = max(at for at, node in enumerate(tree) if node["type"] == "BinOp")
    assert [node["parent"] for node in tree[deepest + 1:deepest + 3]] == [tree[deepest]["id"]] * 2
    assert tree[-1]["parent"] == "ast-4"  # the last 1, in the outermost BinOp
