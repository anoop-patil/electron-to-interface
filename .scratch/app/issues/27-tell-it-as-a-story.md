# 27: Tell it as a story

**What to build:** A learner can read one narrative that walks through every zoom level of an Example. The learner's own Program gets a story stitched together from Templates.

**Blocked by:** 16: Examples load instantly from build-time Analyses; 25: Template generator (Phase 2)

**Status:** ready-for-agent

- [ ] Each Example has a reviewed story across all zoom levels.
- [ ] For the learner's own Program, a story is assembled from the Templates filled with its Facts.

## Comments

- Ticket 16: an Analysis made for an Example when the site was built carries `example`, the Example's ID (`src/examples/examples.ts`), so the page knows when to offer an Example's story. Editing an Example and clicking Run makes an Analysis without it.
