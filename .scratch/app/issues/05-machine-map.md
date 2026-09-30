# 05: Machine map

**What to build:** An always-visible picture of the learner's computer lights up where the thing being viewed lives right now, for zoom levels 1 and 2.

**Blocked by:** 02: Zoom shell: depth gauge, navigation, URLs and themes

**Status:** ready-for-agent

- [ ] The map shows the disk, RAM (Python itself, your steps, objects, plates), the CPU (registers, cache), the operating system and the screen, as in prototype v8.
- [ ] Lit parts carry a short note, for example "hello.py · 22 bytes" on the disk at level 2.
- [ ] Every part opens its Concept card, using the kitchen metaphor: disk = pantry, RAM = counter, CPU = stove, and so on.
- [ ] The map's state is data worked out from the zoom level and the selected element, so each level ticket adds its own state without changing the map.
- [ ] On phones the map collapses behind "Your computer: where is everything?"
