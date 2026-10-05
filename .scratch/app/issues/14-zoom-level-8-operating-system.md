# 14: Zoom level 8: Operating system

**What to build:** A learner follows one line of output from their program, through a system call, into the operating system and on to the terminal app. It has its own Explanation (from Templates), Honesty label, Concept cards, machine map state and Try it yourself, all matching prototype v8.

**Blocked by:** 07: Your program runs: real output and Events; 11: Selecting anything highlights related Facts at every level

**Status:** ready-for-agent

- [ ] The line followed is the one printed by the selected step run, and the learner can pick any other line (ADR 0007).
- [ ] Stages: program → system call → kernel → terminal, with the bytes shown moving as a packet, as in prototype v8.
- [ ] Byte counts come from the real stdout: 13 for hello world; 11 and 13 for greet.py's two lines. Each line is one system call.
- [ ] Hand-written and labeled Typical, and the text carries its own qualifier ("On a typical Linux terminal...").
- [ ] A panel shows the three numbered doors (file descriptors). Concept cards cover system call and doors; the terminal card came with ticket 06.
- [ ] Try it yourself: an `strace` command for the learner's file, with a sample output captured on the stated platform, labeled as the Example's. The bytes `print` handed to `sys.stdout`, piece by piece, are observed live (ticket 06).

## Comments

- Ticket 11: `src/zoom/selection.ts` links each zoom level to the others through Fact IDs. Level 8 shows the step run closest to the Selection until this ticket gives it its lines of output: add its Facts to `FACTS` and replace its entry in `LINKS`. The `Anchor` of a step run carries the run, so the entry can find the line it printed.
