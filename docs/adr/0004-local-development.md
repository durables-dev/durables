# ADR 0004: Local development through Wrangler

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf.

## Decision

The whole system runs on a developer's machine, with no Cloudflare account, through Wrangler's local mode. Wrangler emulates the Workers runtime, D1 and R2 locally. The website runs through Vite's dev server, proxying API calls to the local Worker. End-to-end tests run against this local stack.

Wrangler's configuration file in `api/` runs only the local stack. Deployment is defined in `infrastructure/` (ADR 0003), which reads that file at synth for the bindings, compatibility settings and rate limits the two must share, so they cannot drift.

## Why

Production is on Cloudflare, but testing must not depend on it: no account needed to run the test suite, nothing deployed just to try a change, and no cloud cost from development. Wrangler is the tool Cloudflare provides for exactly this, and the runtime it emulates is the one production uses.

## Consequences

- `api` keeps a Wrangler configuration that names the same D1 database and R2 bucket bindings, `compatibility_date` and compatibility flags the infrastructure defines, so code behaves the same locally and deployed, and the runtime types generated from it match production. Keeping the two in step is a review responsibility, noted in the conventions.
- D1 migrations run locally through the same migration files deployment uses. How deployment applies them is open in ADR 0003.
- Sign-in with real providers cannot run locally without their client secrets. **Open:** how sign-in is exercised locally. The default choice is a local-only fake provider enabled by a Wrangler variable, decided in the `api` conventions.

## Notes

- **2026-10-08, local sign-in decided** in `api/CONVENTIONS.md`. The fake provider lives in a local-only entry point, `api/src/dev.ts`, which `wrangler.toml` runs. It is not enabled by a Wrangler variable. The production build names `api/src/index.ts`, so the fake provider's code is never in the deployed Worker. Since 2026-10-08 the local stack itself runs inside the dev container ([ADR 0011](0011-development-container.md)).
