import functools

def shout(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs).upper() + "!"
    return wrapper

@shout
def greet(name, greeting="hello"):
    return f"{greeting}, {name}"

class Box:
    @property
    def size(self):
        return 3

print(greet("Ada"), Box().size)
print(greet.__name__)
