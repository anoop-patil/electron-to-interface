"""
Zoom level 5's plates: the analyzer replays each frame's plates (its stack) and variables from the step runs, with
Python's rules, and names the objects they point to where it can tell. The tests rebuild the frames after a step run
from the Analysis, as the page does.
"""

import json
import re
from pathlib import Path

import pytest

from analyze import analyze

ROOT = Path(__file__).parents[2]
GREET = json.loads((ROOT / "prototype" / "data" / "example-greet-cpython-3.14.2.json").read_text("utf-8"))


def v8_timeline():
    """Prototype v8's own replay of greet.py's plates, embedded in its page: one entry per step run."""
    page = (ROOT / "prototype" / "hello-zoom-v8.html").read_text("utf-8")
    return json.loads(re.search(r"var TL = (\[.*?\]);\n", page).group(1))


def frames_after(analysis, at):
    """
    The frames after step run `at`, the file's first: each its code object's name, its plates from the bottom up and
    its variables. They are the frames as they stand when the next step runs: the one it runs in, and those waiting
    under it. After the last step run, the Program has finished and none are left.
    """
    runs = analysis["runs"]
    objects = {obj["id"]: dict(obj) for obj in analysis["objects"]}
    plates, variables = {}, {}
    for run in runs[:at + 1]:
        for seen in run.get("objects", []):
            objects[seen["object"]]["repr"] = seen["repr"]
        for change in run.get("plates", []):
            stack = plates.setdefault(change["frame"], [])
            assert change["took"] <= len(stack), f"{run['id']} takes more plates than frame {change['frame']} has"
            del stack[len(stack) - change["took"]:]
            stack.extend(change["put"])
        for change in run.get("variables", []):
            names = variables.setdefault(change["frame"], {})
            if change.get("deleted"):
                names.pop(change["name"], None)
            else:
                names[change["name"]] = change["value"]
    if at + 1 == len(runs):
        return []
    latest = {}
    for run in runs[:at + 2]:
        latest[run["frame"]] = run
    chain, frame = [], runs[at + 1]["frame"]
    while frame is not None:
        chain.insert(0, frame)
        frame = latest[frame]["caller"]

    def shown(label):
        if label.get("empty"):
            return "empty"
        if "object" in label:
            return objects[label["object"]]["repr"]
        made_by = runs[int(label["madeBy"].removeprefix("run-"))]
        return f"answer of {opname(analysis, made_by)}"

    return [
        (
            analysis["bytecode"][analysis["frames"][frame]["code"]]["name"],
            [shown(plate) for plate in plates.get(frame, [])],
            {name: shown(value) for name, value in variables.get(frame, {}).items()},
        )
        for frame in chain
    ]


def opname(analysis, run):
    return next(step["opname"] for step in analysis["bytecode"][run["code"]]["steps"] if step["offset"] == run["offset"])


def runs_of(analysis, name):
    return [at for at, run in enumerate(analysis["runs"]) if opname(analysis, run) == name]


# What v8's badges stand for, as the analyzer shows the objects.
V8_OBJECTS = {
    "K": "<code object greet>", "F": "<function greet>", "T": "('Ada', 'Grace')", "A": "'Ada'", "G": "'Grace'",
    "P": "<function print>", "H": "'Hello,'", "N": "None", "0": "empty",
}


def test_the_plates_each_step_takes_and_puts_back_agree_with_pythons_own_stack_effect():
    import dis

    from analyze import _PLATE_RULES, _plate_counts

    checked = 0
    for opname in _PLATE_RULES:
        opcode = dis.opmap[opname]
        for arg in ([None] if opcode < dis.HAVE_ARGUMENT else range(1, 8)):
            try:
                expected = dis.stack_effect(opcode, arg, jump=False)
            except ValueError:
                continue  # an argument this kind of step never has
            took, put, kept = _plate_counts(opname, arg or 0)
            assert kept <= min(took, put), opname
            assert put - took == expected, (opname, arg)
            checked += 1
    assert checked > 400
    # Every kind of step a program can have has a rule. Specialized and instrumented forms never appear in dis's
    # steps, and nor do CACHE, RESERVED, ENTER_EXECUTOR and INTERPRETER_EXIT.
    import _opcode_metadata
    specialized = {form for forms in _opcode_metadata._specializations.values() for form in forms}
    never_a_step = {"CACHE", "RESERVED", "ENTER_EXECUTOR", "INTERPRETER_EXIT"}
    steps = {name for name, opcode in dis.opmap.items() if opcode < 256 and name not in specialized | never_a_step and not name.startswith("INSTRUMENTED_")}
    assert steps <= set(_PLATE_RULES)


def test_greet_has_the_plates_and_variables_v8_worked_out_after_every_step_run():
    analysis = analyze(GREET["source"], "greet.py")
    timeline = v8_timeline()
    steps = [(code, step) for code in analysis["bytecode"] for step in code["steps"]]

    assert len(analysis["runs"]) == len(timeline)
    for at, (run, entry) in enumerate(zip(analysis["runs"], timeline)):
        code, step = steps[entry["s"]]
        assert (analysis["bytecode"][run["code"]]["name"], run["offset"]) == (code["name"], step["offset"])

        def expected(frame):
            plates = []
            for badge in frame["p"]:
                # v8 knew the walker and print's answer from what greet.py does. Python's rules alone can't say which
                # objects they are, because nothing stores them, so the analyzer names the step that made them.
                if badge == "I":
                    plates.append("answer of GET_ITER")
                elif badge == "N" and frame["c"] == 1 and step["opname"] == "CALL":
                    plates.append("answer of CALL")
                else:
                    plates.append(V8_OBJECTS[badge])
            name = analysis["bytecode"][frame["c"]]["name"]
            return name, plates, {var: V8_OBJECTS[badge] for var, badge in frame["v"]}

        assert frames_after(analysis, at) == [expected(frame) for frame in entry["frames"]], f"after {run['id']}"


def test_a_caught_error_leaves_the_error_on_a_plate_of_the_frame_that_catches_it():
    analysis = analyze("def f():\n    return 1 / 0\n\ntry:\n    f()\nexcept ZeroDivisionError as error:\n    pass")

    handler = runs_of(analysis, "PUSH_EXC_INFO")[0]
    [(name, plates, _)] = frames_after(analysis, handler - 1)
    assert (name, plates) == ("<module>", ["ZeroDivisionError: division by zero"])


def test_a_method_hands_back_its_answer_to_the_plates_of_the_frame_that_called_it():
    analysis = analyze("class Doubler:\n    def double(self, n):\n        return n * 2\n\nx = Doubler().double(4)")

    returned = [at for at in runs_of(analysis, "RETURN_VALUE") if analysis["runs"][at]["code"] == 2][0]
    [module] = frames_after(analysis, returned)
    assert module[1] == ["8"]
    assert frames_after(analysis, runs_of(analysis, "STORE_NAME")[-1])[0][2]["x"] == "8"


def test_while_a_function_runs_its_caller_waits_under_it_and_its_inputs_are_its_variables():
    analysis = analyze("def add(a, b):\n    return a + b\n\nprint(add(2, 3))")

    called = [at for at in runs_of(analysis, "CALL") if analysis["runs"][at]["code"] == 0][0]
    module, add = frames_after(analysis, called)
    assert module == ("<module>", ["<function print>", "empty"], {"add": "<function add>"})
    assert add == ("add", [], {"a": "2", "b": "3"})


def test_an_answer_gets_its_object_once_a_variable_stores_it():
    analysis = analyze('n = len("abc")')

    [called] = runs_of(analysis, "CALL")
    assert frames_after(analysis, called)[0][1] == ["3"]


def test_no_plates_are_left_after_the_program_finishes():
    analysis = analyze('print("Hi")')

    assert frames_after(analysis, len(analysis["runs"]) - 1) == []


def test_a_list_that_changes_is_shown_as_it_was_when_last_seen():
    analysis = analyze("names = []\nnames.append('Ada')\nprint(names)")

    appended = runs_of(analysis, "CALL")[0]
    assert frames_after(analysis, appended - 1)[0][2]["names"] == "[]"
    assert frames_after(analysis, appended + 1)[0][2]["names"] == "['Ada']"


def test_a_method_found_on_the_class_goes_on_a_plate_with_its_object_above_it():
    analysis = analyze("names = []\nnames.append('Ada')")

    [loaded] = runs_of(analysis, "LOAD_ATTR")
    assert frames_after(analysis, loaded)[0][1] == ["<method append>", "[]"]


def test_a_comprehension_hands_back_the_variable_it_borrowed():
    analysis = analyze("squares = [n * n for n in range(3)]")

    assert frames_after(analysis, len(analysis["runs"]) - 2)[0][2] == {"squares": "[0, 1, 4]"}


def test_a_class_body_shows_the_names_the_program_gives_it_and_not_those_python_adds():
    analysis = analyze("class Point:\n    def __init__(self):\n        pass\n    size = 2")

    body = [at for at, run in enumerate(analysis["runs"]) if run["code"] == 1]
    assert frames_after(analysis, body[-2])[-1][2] == {"__init__": "<function Point.__init__>", "size": "2"}


def test_a_variable_another_frame_changes_through_nonlocal_is_read_again():
    analysis = analyze("def outer():\n    total = 1\n    def add():\n        nonlocal total\n        total = 5\n    add()\n    return total\nouter()")

    returned = [at for at in runs_of(analysis, "RETURN_VALUE") if analysis["runs"][at]["code"] == 1][0]
    assert frames_after(analysis, returned - 1)[-1][2]["total"] == "5"


def test_each_object_has_its_type_its_repr_and_for_pythons_own_types_its_size():
    analysis = analyze('class Box:\n    pass\n\nb = Box()\ntext = "Ada"')

    objects = {obj["repr"]: obj for obj in analysis["objects"]}
    assert objects["'Ada'"] == {"id": objects["'Ada'"]["id"], "type": "str", "repr": "'Ada'", "size": 44}
    # Measuring an object of the Program's own class could run the Program's code, so it has no size.
    assert objects["<Box object>"]["type"] == "Box"
    assert "size" not in objects["<Box object>"]


PROGRAMS = [
    "for i in range(3):\n    print(i * i)",
    "squares = [n * n for n in range(4)]\nprint(sum(squares))",
    "def gen():\n    yield 1\n    yield 2\nprint(list(gen()))\nfor n in gen():\n    print(n)",
    "def fact(n):\n    return 1 if n < 2 else n * fact(n - 1)\nprint(fact(5))",
    "try:\n    int('x')\nexcept ValueError:\n    print('no')\nfinally:\n    print('done')",
    "class Point:\n    def __init__(self, x):\n        self.x = x\n    def __repr__(self):\n        return f'P({self.x})'\nprint(Point(1))",
    "names = sorted(['b', 'a'], key=lambda s: s)\nprint(f'{names[0]}!')",
    "def outer():\n    total = 0\n    def add(n):\n        nonlocal total\n        total += n\n    add(2)\n    return total\nprint(outer())",
    "match [1, 2]:\n    case [a, b]:\n        print(a + b)",
    "with open('program.py') as file:\n    print(len(file.read()) > 0)",
    "a, b = 1, 2\na, b = b, a\nprint(a, b, {'k': a}, {b})",
    "x = 5\nif x > 3 and x != 4:\n    print('big')\nelse:\n    print('small')",
    "import math\nprint(math.sqrt(16), 'a'.upper())",
    "def g():\n    try:\n        yield 1\n    finally:\n        print('closed')\nfor n in g():\n    break",
    "def f():\n    raise KeyError('k')\ntry:\n    f()\nexcept KeyError as e:\n    print(repr(e))",
]


@pytest.mark.parametrize("program", PROGRAMS)
def test_every_frame_returns_with_one_plate_its_answer_and_the_replay_is_sure_throughout(program):
    analysis = analyze(program)

    assert not any(run.get("platesUnsure") for run in analysis["runs"])
    for at in runs_of(analysis, "RETURN_VALUE"):
        frame = analysis["runs"][at]["frame"]
        # Rebuilding every frame checks that no step takes more plates than its frame has.
        *_, (_, plates, _) = frames_after(analysis, at - 1)
        assert len(plates) == 1, f"{program!r}: frame {frame} at {analysis['runs'][at]['id']}: {plates}"


# Each program prints "ran" once, itself, when it reads p.x.
@pytest.mark.parametrize("program", [
    "class P:\n    @property\n    def x(self):\n        print('ran')\n        return 1\np = P()\np.x",
    "class P:\n    def __getattribute__(self, name):\n        print('ran')\n        return 1\np = P()\np.x",
    "class P:\n    def __getattr__(self, name):\n        print('ran')\n        return 1\np = P()\np.x",
    "class Meta(type):\n    def __repr__(cls):\n        print('ran')\n        return 'M'\nclass P(metaclass=Meta):\n    pass\nP.x = 1\nP.x",
])
def test_replaying_the_plates_never_runs_the_programs_own_code(program):
    assert analyze(program)["stdout"] == ("ran\n" if "p.x" in program else "")
