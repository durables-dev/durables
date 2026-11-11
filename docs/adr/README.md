# Architecture decision records

Decisions that shape how Durables is built. Each record states the decision, why it was made, and what follows from it. Conventions for each surface are written against these records; where a record leaves something open, it says so.

| ADR                                     | Decision                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-fresh-start.md)             | Build from scratch on the `mvp` branch; no proof-of-concept code is reused                                            |
| [0002](0002-cloudflare-hosting.md)      | Host on Cloudflare: Workers on the paid plan, with billing alerts                                                     |
| [0003](0003-infrastructure-as-code.md)  | Define and deploy the whole system with CDK Terrain; Wrangler is for local development only                           |
| [0004](0004-local-development.md)       | Everything runs locally through Wrangler, with no Cloudflare account needed to test                                   |
| [0005](0005-data-stores.md)             | D1 for accounts, ownership and the search index; R2 for activity and version documents                                |
| [0006](0006-caching-and-rate-limits.md) | Published versions are cached at the edge indefinitely; publishing and reporting are rate-limited                     |
| [0007](0007-sign-in-and-accounts.md)    | Sign in through GitHub, GitLab, Google or Microsoft for identity only; tokens are never stored; handles are permanent |
| [0008](0008-detection-and-checks.md)    | Detection is regex-based; checks run through a pluggable pipeline with an AI tier reserved                            |
| [0009](0009-analytics-and-privacy.md)   | Cloudflare Web Analytics with no cookies; the smallest possible data footprint                                        |
| [0010](0010-surfaces-and-stacks.md)     | Four surfaces, `web`, `api`, `infrastructure` and `e2e`, and the stack for each                                       |
| [0011](0011-development-container.md)   | Develop and test in one dev container; running natively is not supported                                              |

Records are numbered in the order they were written and never renumbered. A superseded record stays in place with a note pointing to its replacement.
