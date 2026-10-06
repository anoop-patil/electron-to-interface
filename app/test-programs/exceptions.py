class TooBig(Exception):
    pass

def check(n):
    if n > 10:
        raise TooBig(f"{n} is too big")
    assert n >= 0, "negative"
    return n

for n in [3, 11, -1]:
    try:
        check(n)
    except TooBig as error:
        print("caught:", error)
    except (ValueError, AssertionError):
        print("not allowed")
    else:
        print("fine:", n)
    finally:
        print("checked", n)
