def divide(a, b):
    return a / b

total = 0
for b in [2, 1, 0]:
    total += divide(10, b)
    print(total)
