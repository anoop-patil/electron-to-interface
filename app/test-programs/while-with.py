import io

with io.StringIO() as buffer, open("program.py") as source:
    buffer.write(source.readline())
    print(len(buffer.getvalue()))

i = 0
while True:
    i += 1
    if i == 2:
        continue
    if i > 4:
        break
else:
    print("never")
numbers = [1, 2, 3]
numbers[1:2] = [9]
print(i, numbers, {**{"a": 1}}, print.__doc__ is not None)
