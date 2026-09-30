# Five honesty labels instead of three

Three labels (Traced, Pre-traced reference, Typical behavior) forced some content into labels that overclaimed. The stack of plates at level 5 is worked out from Python's rules, not recorded. Level 7 in the prototype is a made-up example. So we use five labels: **Observed** (Python recorded it from your code), **Derived** (worked out from observed facts by Python's rules), **Reference** (real, prepared in advance, such as CPython source or measurements on a test machine), **Illustrative** (a made-up example, not real data) and **Typical** (how it usually works). Each zoom level has one label, and a panel whose provenance differs from its level carries its own label. The page simplifies aggressively, and the labels stop it from claiming false precision.

## Consequences

- Labels are shown as text chips. Only Illustrative gets a distinct (warning) color. An early version also encoded each label as a border style (solid, double, dashed, dotted); learners couldn't tell those apart at a glance, so it was dropped.
- Every label is clickable and opens the same "How we know" concept card with all five definitions.
- Anything shown as Observed must have been captured with the pinned CPython version, and the page says which version.
- Illustrative content is allowed only in the prototype. As of prototype v6, level 7 is Reference: real machine code from the pinned build. In v6 the path LOAD_NAME takes for `print` through that code was Derived, worked out from Python's lookup rules. From v7 the path through every handler is recorded with gdb on the test machine (`prototype/tools/trace-handler-paths.sh`), so it is Reference; the recording matched the Derived LOAD_NAME path exactly.
