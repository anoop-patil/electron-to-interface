class Dog:
    def __init__(self, name):
        self.name = name

    def speak(self):
        print(self.name, "says woof")

for name in ["Rex", "Fido"]:
    Dog(name).speak()
