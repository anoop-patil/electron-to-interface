from analyze import analyze


def test_hello_world_is_22_bytes_from_p_to_the_newline():
    analysis = analyze('print("Hello World!")')

    values = [b["value"] for b in analysis["bytes"]]
    assert len(values) == 22
    assert values[0] == 112  # p
    assert values[-1] == 10  # the newline the editor adds when it saves


def test_a_program_that_already_ends_with_a_newline_gets_no_second_one():
    analysis = analyze('print("Hello World!")\n')

    assert [b["value"] for b in analysis["bytes"]][-2:] == [41, 10]  # ) then the newline
    assert len(analysis["bytes"]) == 22


def test_each_byte_is_a_fact_linked_to_the_character_it_encodes():
    # é takes two bytes in UTF-8, 0xC3 0xA9; both belong to character 5.
    analysis = analyze('s = "é"')

    assert analysis["bytes"][4:8] == [
        {"id": "byte-4", "value": 0x22, "charIndex": 4, "line": 1},
        {"id": "byte-5", "value": 0xC3, "charIndex": 5, "line": 1},
        {"id": "byte-6", "value": 0xA9, "charIndex": 5, "line": 1},
        {"id": "byte-7", "value": 0x22, "charIndex": 6, "line": 1},
    ]
    assert analysis["bytes"][0]["id"] == "byte-0"


def test_every_line_ends_in_a_newline_byte_that_belongs_to_that_line():
    analysis = analyze("a = 1\nb = 2\nprint(a + b)")

    newlines = [b for b in analysis["bytes"] if b["value"] == 10]
    assert [b["line"] for b in newlines] == [1, 2, 3]
    assert newlines[-1] == analysis["bytes"][-1]


def test_the_analysis_carries_the_program_as_a_saved_file():
    assert analyze("x = 1")["program"] == "x = 1\n"
