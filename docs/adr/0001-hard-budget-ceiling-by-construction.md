# Hard $500/month budget ceiling, enforced by construction

Total spend must never exceed $500 in any month, whatever the traffic or abuse. Budget alerts only notify and cannot enforce that, so we only use paid services that physically cannot bill beyond a limit: free tiers that stop serving at their quota, fixed-price services, or prepaid credit with auto-reload turned off. The fixed monthly prices of everything we use must add up to less than $500.

## Consequences

- Pay-as-you-go services with no hard stop (AWS, GCP, Cloudflare Workers Paid overage, usage-billed container hosts) are off-limits, even when they look cheaper.
- Static hosting is on Cloudflare Pages because it doesn't charge for bandwidth. Pyodide is about 10 MB per first visit, so a viral day could move about 1 TB, which would bill or suspend us on hosts that meter bandwidth.
- When a metered feature hits its limit, it switches off and the app falls back to what is free (Templates, the Reference Library). It never tries to buy more capacity.
- The repo is public, so CI minutes are free and unlimited.
