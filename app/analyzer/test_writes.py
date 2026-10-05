"""The pieces the Program handed to sys.stdout and sys.stderr, in order: what zoom level 8 follows to the operating system."""

import re

from analyze import RECORD_LIMIT, analyze


def without_colors(text):
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def pieces(analysis):
    return [(write["door"], write["text"]) for write in analysis["writes"] if "text" in write]


def test_print_hands_sys_stdout_each_thing_with_a_space_between_and_a_newline_at_the_end():
    analysis = analyze('print("Hello,", "Ada")')

    assert pieces(analysis) == [(1, "Hello,"), (1, " "), (1, "Ada"), (1, "\n")]
    assert analysis["writesCutShort"] is False


def test_each_piece_names_the_step_run_that_wrote_it():
    analysis = analyze('print("Hi")')

    call = next(at for at, run in enumerate(analysis["runs"]) if run.get("printed"))
    assert [write["run"] for write in analysis["writes"]] == [call, call]


def test_end_and_sep_are_pieces_too_even_when_empty():
    analysis = analyze('print("a", "b", sep="", end="")')

    assert pieces(analysis) == [(1, "a"), (1, ""), (1, "b"), (1, "")]


def test_a_flush_is_kept_in_order_with_the_pieces():
    analysis = analyze('import sys\nprint("Loading", end="", flush=True)\nprint("!", file=sys.stderr)\nsys.stdout.flush()')

    assert [write.get("text", "flush") for write in analysis["writes"]] == ["Loading", "", "flush", "!", "\n", "flush"]
    assert analysis["writes"][2]["door"] == 1 and "run" in analysis["writes"][2]


def test_pieces_for_stdout_and_stderr_are_kept_in_the_order_they_were_written():
    analysis = analyze('import sys\nprint("one")\nprint("two", file=sys.stderr)')

    assert pieces(analysis) == [(1, "one"), (1, "\n"), (2, "two"), (2, "\n")]


def test_pythons_report_of_an_error_is_its_traceback_as_a_terminal_gets_it_in_color():
    analysis = analyze('print("before")\n1 / 0')

    report = [write for write in analysis["writes"] if write.get("report")]
    assert all(write["door"] == 2 and "run" not in write for write in report)
    # A terminal gets the same text as the Terminal panel shows, with the color codes Python 3.14 adds for a terminal.
    colored = "".join(write["text"] for write in report)
    assert "\x1b[" in colored
    assert analysis["stderr"] == without_colors(colored)
    assert not any(write.get("report") for write in analysis["writes"][:2])


def test_the_message_sys_exit_was_given_is_pythons_report_too():
    analysis = analyze('import sys\nsys.exit("bye")')

    assert [(write["text"], write.get("report")) for write in analysis["writes"]] == [("bye", True), ("\n", True)]


def test_a_syntax_error_is_reported_with_nothing_written_before_it():
    analysis = analyze('print("Hi"')

    assert analysis["writes"] and all(write.get("report") for write in analysis["writes"])


def test_a_program_that_writes_a_lot_keeps_the_first_pieces_and_pythons_report():
    analysis = analyze(f"for i in range({RECORD_LIMIT}):\n    print(i)\n1 / 0")

    assert analysis["writesCutShort"] is True
    own = [write for write in analysis["writes"] if not write.get("report")]
    assert len(own) == RECORD_LIMIT
    assert analysis["writes"][-1]["report"] is True
