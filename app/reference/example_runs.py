"""What ran on each step run of the Examples, and the machine code it ran, for the Reference Library.

The gdb captures in prototype/data/ record every handler that ran, in order, and every machine instruction each one
ran. This lines them up with the step runs the analyzer records for the same Program, so each step run gets the
Reference Library entries of the handlers that ran for it, with the path each took through its machine code. The
Reference Library keeps the result under `examples`, and the machine code of every handler that ran under `machineCode`.

Usage: python reference/example_runs.py   (from app/; rewrites both in reference/cpython-3.14.2.json)
"""

import json
import pathlib
import re
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "analyzer"))

from analyze import analyze  # noqa: E402

LIBRARY = HERE / "cpython-3.14.2.json"
TEMPLATES = HERE.parent / "templates" / "py314.json"
DATA = HERE.parent.parent / "prototype" / "data"

# Each Example, the gdb capture of its handlers, and the capture of its Try it yourself commands, with the timing and strace.
EXAMPLES = [
    ("hello world", "handler-paths-cpython-3.14.2-linux-x86_64.json", "example-hello-cpython-3.14.2.json"),
    ("greet.py", "handler-paths-greet-cpython-3.14.2-linux-x86_64.json", "example-greet-cpython-3.14.2.json"),
]

# The machine code of every handler greet.py ran, with the .warm and .cold parts; hello world ran a few of the same.
MACHINE_CODE = "machine-code-greet-cpython-3.14.2-linux-x86_64.json"
HELLO_MACHINE_CODE = "machine-code-cpython-3.14.2-linux-x86_64.json"
# The SHA-256 of the python3.14 binary the tools in prototype/tools/ disassemble and trace; they check it too.
BINARY_SHA256 = "bdeee805c9267caee4c13c811de2082ca08c14e434280ef3bd7fcc31a90f7bd3"

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


def _resume_check(step):
    return step["src"] is not None and step["src"][0] == "generated_cases.c.h" and step["src"][1] in RESUME_CHECK_LINES


def handler_run(run):
    """
    One handler run, for the Reference Library: its entry, the address of every instruction it ran, in order, the
    functions it called, and the numbers its inc and dec instructions changed.
    """
    steps = run["steps"]
    calls = {}
    for call in run["calls"]:
        name = call["fn"].split(".llvm.")[0]
        calls[name] = calls.get(name, 0) + 1
    found = {
        "entry": entry_of(run),
        "path": [step["pc"] for step in steps],
        "calls": [{"function": name, "times": times} for name, times in calls.items()],
        "values": [{"at": at, "before": step["value"][0], "after": step["value"][1]} for at, step in enumerate(steps) if "value" in step],
    }
    return found


def copied_from(run):
    """
    Where in its path a handler run started running RESUME_CHECK's code, which the compiler copied onto its end, for
    the next step to run no handler of its own. From there on, it runs no line of any other handler: only RESUME_CHECK's,
    and the helpers it uses. (Line numbers alone aren't enough: the compiler gives other handlers' last jump to the next
    handler one of RESUME_CHECK's lines, where their code merged.)
    """
    steps = run["steps"]
    copied = next(at for at, step in enumerate(steps) if _resume_check(step))
    if not all(_resume_check(step) or step["src"] is None or step["src"][0] != "generated_cases.c.h" for step in steps[copied:]):
        raise ValueError(f"{run['op']} ran other code after RESUME_CHECK's")
    return copied


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
            ran.append(handler_run(handlers[at]))
            at += 1
        if not ran:
            before = handlers[at - 1] if at else None
            folded = (
                opnames[place] == "RESUME" and before is not None and before["op"] == "CALL_PY_EXACT_ARGS"
                and any(_resume_check(step) for step in before["steps"])
            )
            if not folded:
                raise ValueError(f"gdb recorded no handler for step run {run['id']} at {place}")
            runs[-1]["handlers"][-1]["copied"] = {"entry": "RESUME_CHECK", "from": copied_from(before)}
            ran = [{"entry": "RESUME_CHECK", "inside": "CALL_PY_EXACT_ARGS"}]
        runs.append({"code": run["code"], "offset": run["offset"], "handlers": ran})
    if at != len(handlers):
        raise ValueError(f"gdb recorded {len(handlers) - at} handler runs after the last step run")
    return runs


def try_it_command(level, file):
    """A zoom level's Try it yourself command, for a Program saved as `file`."""
    command = json.loads(TEMPLATES.read_text("utf-8"))["tryIt"][str(level)]["command"]
    return command.replace("{file}", file)


def strace_output(captured, printed):
    """
    strace's output as the page shows it: without the colors strace gives it in a terminal, and without the Example's
    own lines, which reach the same terminal in the middle of strace's.
    """
    output = re.sub(r"\x1b\[[0-9;]*m", "", captured)
    for line in printed.splitlines(keepends=True):
        output = output.replace(line, "", 1)
    return output


def examples():
    """The Examples the Reference Library knows what ran for, from the gdb captures, each with its timing and strace samples."""
    found = []
    for name, file, commands in EXAMPLES:
        capture = json.loads((DATA / file).read_text("utf-8"))
        captured = json.loads((DATA / commands).read_text("utf-8"))
        program = capture["program"] if capture["program"].endswith("\n") else capture["program"] + "\n"
        with tempfile.TemporaryDirectory() as folder:
            printed = analyze(program, "program.py", folder=folder)["stdout"]

        def sample(level, output):
            return {"command": try_it_command(level, captured["file"]), "output": output, "platform": captured["platform"]}

        found.append({
            "name": name,
            "program": program,
            "recorded": f"{capture['how']}, on {capture['binary']}",
            "runs": example_runs(program, capture),
            "samples": {"7": sample(7, captured["commands"]["time"]), "8": sample(8, strace_output(captured["commands"]["strace"], printed))},
        })
    return found


def _instruction(row, part):
    """One machine instruction, from the disassembly: [address, bytes, mnemonic, operands, note]."""
    at, data, mnemonic, operands, note = row
    return {"at": at, "bytes": data, "mnemonic": mnemonic, "operands": operands, **({"note": note} if note else {}), **({"part": part} if part != "main" else {})}


def machine_code():
    """The machine code of every handler the Examples ran: its main part, then its .warm and .cold parts."""
    code = json.loads((DATA / MACHINE_CODE).read_text("utf-8"))
    hello = json.loads((DATA / HELLO_MACHINE_CODE).read_text("utf-8"))
    for op, handler in hello["ops"].items():
        if any(handler[key] != code["ops"][op][key] for key in handler):
            raise ValueError(f"the two disassemblies of {op} differ")
    handlers = {}
    for op, handler in code["ops"].items():
        rows = [_instruction(row, "main") for row in handler["ins"]]
        for part in ("warm", "cold"):
            rows += [_instruction(row, part) for row in handler["more"].get(part, [])]
        handlers[op] = {"symbol": handler["sym"], "size": handler["size"], "warm": handler["warm"], "cold": handler["cold"], "instructions": rows}
    return {"binary": code["binary"], "sha256": BINARY_SHA256, "handlers": handlers}


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
    library["machineCode"] = machine_code()
    LIBRARY.write_bytes((to_json(library) + "\n").encode("utf-8"))
