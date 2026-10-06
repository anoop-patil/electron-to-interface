def describe(thing):
    match thing:
        case 0 | 1:
            return "tiny"
        case int(n) if n < 0:
            return "negative"
        case [x, y, *rest]:
            return f"a list starting {x}, {y} and {len(rest)} more"
        case {"name": name}:
            return "named " + name
        case str() as text:
            return text * 2
        case _:
            return "something else"

for thing in [1, -5, [1, 2, 3, 4], {"name": "Ada"}, "ha", 2.5]:
    print(describe(thing))
