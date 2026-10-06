import math
from collections import Counter
type Pair = tuple[int, int]

def first[T](items: list[T]) -> T:
    return items[0]

def outer():
    count = 0
    def inner():
        nonlocal count
        count += 1
    inner()
    return count

if (n := len("walrus")) > 3 and 0 < n <= 10:
    print(first([n, 2]), outer(), Counter("hello").most_common(1), math.pi)
x, *rest = "abc"[::-1]
del rest
print(t"hi {x}".strings, x if x else None, ~5, not x, 2 ** -1)
