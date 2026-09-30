# No runtime backend in v1

v1 is a static site only. Zoom levels 1–5 are Observed in the browser (Pyodide in a Web Worker). Levels 6–7 come from the Reference Library, levels 8–9 are hand-written, and all Templates, including those written with Claude, are generated at build time and shipped as static files. Nothing a user does calls a server we pay for. So cost stays at about $0 whatever the traffic, there's no endpoint to abuse, and "your code never leaves your browser" is literally true.

## Considered Options

- **Live AI explanations per user (the original Phase 2).** Rejected for v1. Most of the teaching value (what `LOAD_NAME` or `CALL` does) doesn't depend on the user's exact code, so it can be written once at build time.
- **Live native tracing in a server sandbox (the original Phase 3b).** Parked, not rejected. Even a live trace only shows our server's CPU, not the learner's, so it adds little over a Reference Library keyed by specialized opcode, while bringing a sandbox, a queue, untrusted code on our hardware and a summarizer.

## Consequences

- Reopen live native tracing only if more than 10% of sessions reach zoom level 7 **and** the Reference Library finds no exact match for more than 20% of the level-7 zooms in the Coverage corpus. Both are measured without adding a service:
  - **Reaching level 7:** each zoom level has its own URL path (e.g. `/zoom/7`), which Cloudflare Web Analytics counts as page views. Web Analytics has no custom events.
  - **Library misses:** measured at build time by running the analyzer over the Coverage corpus. CI reports coverage on every change, and no user data is involved.
- If a backend returns, use the stack that fits the feature, not one shared FastAPI server:
  - **Live AI:** a Cloudflare Worker on the free plan (a hard stop at its daily quota) plus prepaid Anthropic credit.
  - **Live native tracing:** FastAPI on a fixed-price VPS, with nsjail or gVisor and a bounded queue that returns "busy" when full.

  Both must satisfy ADR 0001.
