class Door:
    async def __aenter__(self):
        print("open")
    async def __aexit__(self, *details):
        print("shut")

async def ticker(n):
    for i in range(n):
        yield i
async def double(x):
    return x * 2

async def main():
    async with Door():
        return [await double(i) async for i in ticker(3)]

try:
    main().send(None)
except StopIteration as done:
    print(done.value)
