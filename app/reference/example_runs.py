"""Which handlers ran on each step run of the Examples, for the Reference Library.

The gdb captures in prototype/data/ record every handler that ran, in order. This lines them up with the step runs
the analyzer records for the same Program, so each step run gets the Reference Library entries of the handlers that
ran for it. The Reference Library keeps the result under `examples`.

Usage: python reference/example_runs.py   (from app/; rewrites the examples in reference/cpython-3.14.2.json)
"""

import json
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "analyzer"))

from analyze import analyze  # noqa: E402

LIBRARY = HERE / "cpython-3.14.2.json"
DATA = HERE.parent.parent / "prototype" / "data"

# Each Example, and the gdb capture of its handlers.
EXAMPLES = [
    ("hello world", "handler-paths-cpython-3.14.2-linux-x86_64.json"),
    ("greet.py", "handler-paths-greet-cpython-3.14.2-linux-x86_64.json"),
]

# The lines of generated_cases.c.h that hold RESUME_CHECK's code. The compiler copied them onto the end of
# CALL_PY_EXACT_ARGS, so after that handler a function's RESUME runs no handler of its own (ADR 0003).
RESUME_CHECK_LINES = range(10543, 10572)


def _handler(name):
    """A handler's name, from gdb's name for it: _TAIL_CALL_LOAD_NAME.llvm.123 in section .text of … is LOAD_NAME."""
    return name.split()[0].split(".llvm.")[0].removeprefix("_TAIL_CALL_")


def entry_of(run):
    """The Reference Library entry for one handler run: its handler, and how it ran where that changes the C shown."""
    op, calls, after = run["op"], [call["fn"] for call in run["calls"]], _handler(run["next"])
    if op == "CALL":
        if "_Py_Specialize_Call" in calls:
            return "CALL/rewrites"
        # A function written in Python carries straight on with its own first step, RESUME.
        return "CALL/python" if after == "RESUME" else "CALL/c"
    if op == "LOAD_GLOBAL":
        return "LOAD_GLOBAL/rewrites" if "_Py_Specialize_LoadGlobal" in calls else op
    if op in ("FOR_ITER", "JUMP_BACKWARD"):
        # Run again at once, in the new form: the same step's next handler is a variant of this one.
        return f"{op}/rewrites" if after.startswith(op + "_") else op
    if op == "FOR_ITER_TUPLE":
        return "FOR_ITER_TUPLE/ends" if after == "POP_ITER" else op
    return op


def example_runs(program, capture):
    """
    Each step run of the Program, as the analyzer records it, with the handlers gdb recorded for it, in the order they
    ran. Fails if the two records don't line up.
    """
    with tempfile.TemporaryDirectory() as folder:
        analysis = analyze(program, "program.py", folder=folder)
    codes = {code["qualname"]: at for at, code in enumerate(analysis["bytecode"])}
    opnames = {(at, step["offset"]): step["opname"] for at, code in enumerate(analysis["bytecode"]) for step in code["steps"]}
    handlers = capture["runs"]
    runs, at = [], 0
    for run in analysis["runs"]:
        place = (run["code"], run["offset"])
        ran = []
        # A step run's handlers: the first for this step, then any it handed over to, in a new form of the same step.
        while at < len(handlers) and (codes[handlers[at].get("code", "<module>")], handlers[at]["offset"]) == place:
            if ran and _handler(handlers[at - 1]["next"]) != handlers[at]["op"]:
                break
            ran.append({"entry": entry_of(handlers[at])})
            at += 1
        if not ran:
            before = handlers[at - 1] if at else None
            folded = (
                opnames[place] == "RESUME" and before is not None and before["op"] == "CALL_PY_EXACT_ARGS"
                and any(step["src"] and step["src"][0] == "generated_cases.c.h" and step["src"][1] in RESUME_CHECK_LINES for step in before["steps"])
            )
            if not folded:
                raise ValueError(f"gdb recorded no handler for step run {run['id']} at {place}")
            ran = [{"entry": "RESUME_CHECK", "inside": "CALL_PY_EXACT_ARGS"}]
        runs.append({"code": run["code"], "offset": run["offset"], "handlers": ran})
    if at != len(handlers):
        raise ValueError(f"gdb recorded {len(handlers) - at} handler runs after the last step run")
    return runs


def examples():
    """The Examples the Reference Library knows which handlers ran for, from the gdb captures."""
    found = []
    for name, file in EXAMPLES:
        capture = json.loads((DATA / file).read_text("utf-8"))
        program = capture["program"] if capture["program"].endswith("\n") else capture["program"] + "\n"
        found.append({
            "name": name,
            "program": program,
            "recorded": f"{capture['how']}, on {capture['binary']}",
            "runs": example_runs(program, capture),
        })
    return found


def to_json(value, indent=""):
    """JSON with 2-space indents, keeping on one line each object or list that holds no others, or fits in 120 characters."""
    flat = json.dumps(value, ensure_ascii=False)
    items = list(value.values()) if isinstance(value, dict) else value if isinstance(value, list) else None
    if items is None or not items or len(indent) + len(flat) <= 120 or not any(isinstance(item, (dict, list)) for item in items):
        return flat
    inner = indent + "  "
    if isinstance(value, dict):
        rows = [f"{inner}{json.dumps(key, ensure_ascii=False)}: {to_json(item, inner)}" for key, item in value.items()]
        return "{\n" + ",\n".join(rows) + f"\n{indent}}}"
    return "[\n" + ",\n".join(inner + to_json(item, inner) for item in value) + f"\n{indent}]"


if __name__ == "__main__":
    library = json.loads(LIBRARY.read_text("utf-8"))
    library["examples"] = examples()
    LIBRARY.write_bytes((to_json(library) + "\n").encode("utf-8"))
