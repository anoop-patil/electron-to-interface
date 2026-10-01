# 05: Machine map

**What to build:** An always-visible picture of the learner's computer lights up where the thing being viewed lives right now, for zoom levels 1 and 2.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [x] The map shows the disk, RAM (Python itself, your steps, objects, plates), the CPU (registers, cache), the operating system and the screen, as in prototype v8.
- [x] Lit parts carry a short note, for example "hello.py · 22 bytes" on the disk at level 2.
- [x] Every part opens its Concept card, using the kitchen metaphor: disk = pantry, RAM = counter, CPU = stove, and so on.
- [x] The map's state is data worked out from the zoom level and the selected element, so each level ticket adds its own state without changing the map.
- [x] On phones the map collapses behind "Your computer: where is everything?"

## Comments

Built in `app/src/machine/`. Decisions made along the way:

- Levels 1 and 2 light RAM, not the disk. The app keeps the Program in memory and never saves it as a file (tickets 03 and 04), so the ticket's example "hello.py · 22 bytes" on the disk would be false. The notes are "your program · 1 line" at level 1 and "your program · 22 characters" at level 2. Level 2 counts characters, not bytes: 22 is the Program's size in UTF-8, but neither the browser nor Python holds it in RAM as UTF-8.
- Nothing is lit before the first Run, or at a level that isn't built yet.
- `mapState.ts` holds the state: for each zoom level, a function from the Analysis and the Selection (a Fact ID) to the lit parts and their notes. A level ticket adds its entry there. Levels 1 and 2 don't use the Selection yet.
- The notes are Templates (`map.level1.ram`, `map.level2.ram`), filled with Facts. A note sits inside a part, which is a button that opens the part's card, so the build fails if a note would open a card itself. It also fails if a part of the map has no Concept card.
- The map sits under the editor. A lit part is marked `aria-current`, so screen readers hear which part is lit.
- The eleven cards are ported from prototype v8, in the Concepts index groups v8 uses. Changes from v8:
  - Details only true of greet.py (two recipe cards, nine objects, 4 plates) are gone; the cards are general. So are links to cards that don't exist yet, such as address, frame and system call.
  - The disk is "storage", not "SSD", since the learner's computer may not have an SSD, and its card says the app never saves the Program to the disk.
  - The flow line under the disk says "programs are copied into RAM to run", since the Program never comes from the disk.
  - Registers are "the burners on the stove", not "what the cook is holding": the cook is the interpreter, and registers are part of the CPU. The operating system is "the restaurant manager", to stay in the kitchen.
  - Python itself says that in this app it runs inside your browser.
- Not ported from v8: the CPU's "N cores here", because browsers report logical processors and may cap the number, so it can't be stated as cores; and, on the cards, "Right now, for your program", typical sizes, the fetch-time ladder and live device facts. None of these is in this ticket.
