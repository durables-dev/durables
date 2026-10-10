# ADR 0002: Host on Cloudflare

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf.

## Decision

Durables runs on Cloudflare's developer platform: the API and the website as Workers, with D1 and R2 for storage (ADR 0005). The account is on the **Workers Paid plan**, so usage beyond the included allowance is billed rather than refused. **Billing alerts** are configured so unusual usage is noticed within hours. The Workers Paid subscription and the account budget alert are set in the Cloudflare dashboard, not in `infrastructure/`: the provider manages subscriptions only for partner accounts, and budget alerts have no API.

## Why

Durables is a free community site with no income, so running costs must stay low. Cloudflare's allowances cover a site of this size for little or nothing, DNS and email forwarding for `durables.dev` are already there, and analytics (ADR 0009) comes from the same account. The paid plan is chosen over the free plan because free-plan limits stop serving when exceeded; a traffic spike must cost a little money, not take the site down.

## Consequences

- Code is written for the Workers runtime: web-standard APIs, no Node.js-only modules, and a CPU-time budget per request. Durables' work per request is light (regex over one file, a few API calls at publish), so this fits, but it is a constraint from the first line of code.
- Costs are kept bounded by caching immutable content at the edge and rate-limiting the expensive endpoints (ADR 0006).
- The platform is Cloudflare-specific. R2 speaks the S3 protocol and D1 is SQLite underneath, which limits lock-in for data, but the Worker code and infrastructure definitions are not portable without work.
