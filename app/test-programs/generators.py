def countdown(n):
    while n > 0:
        yield n
        n -= 1
    return "liftoff"

def both():
    result = yield from countdown(3)
    yield result

squares = (x * x for x in range(4))
print(list(both()), sum(squares))
evens = {x for x in range(10) if x % 2 == 0}
table = {x: str(x) for x in range(3)}
print(sorted(evens), table, [*map(lambda x: x + 1, [1, 2])])
