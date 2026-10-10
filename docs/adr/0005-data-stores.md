# ADR 0005: Data stores

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf.

## Decision

- **D1** (Cloudflare's SQLite) holds accounts, sign-in links, handle ownership, and the **search index**: one row per listing with the fields search and filters read.
- **R2** holds documents: one object per published version, containing the code and all of its metadata (SDK, detected facts, generated snippets, title, the description as it was when published, and later the declarations and README). Objects are written once and never changed. The listing's current description lives only in D1, since it can change after publishing (ADR 0006).
- All document access goes through one storage interface in `api`, so the store behind it can change without touching the rest of the code.

## Why

Durables stores two kinds of data. Accounts and ownership are small, relational and queried by key. Published versions are documents, immutable, read far more than written, and best served straight from object storage with edge caching (ADR 0006). D1 and R2 fit those shapes, both have free allowances, and R2 has no egress fees. Search needs an index because reading every document per query, the proof of concept's shortcut, gets more expensive as the catalog grows.

## Consequences

- **Immutability is enforced, not assumed.** A version's object is written with a conditional put that fails if the key exists, and an object counts as published only once its D1 row exists. Together these make republishing a published address impossible; the only rewrite of a key is a retried publish replacing an orphan that never had a row (see Notes).
- **Publishing writes to two stores.** The version object is written first, then the D1 rows (ownership, search index). If the second write fails, the publish is reported as failed and the orphan object is cleaned up or reconciled. **Open:** the exact reconciliation approach, decided in the `api` conventions.
- The search index is fed at publish time and updated when a listing's description changes. Search never reads R2.
- Addresses are the key everywhere: `handle/name@version` maps to one D1 row and one R2 object.

## Notes

- **2026-10-08, reconciliation decided** in `api/CONVENTIONS.md`.
  - If the R2 write fails, nothing is written to D1 and the publish fails.
  - If the D1 write fails, the publish fails and the R2 object is deleted right away.
  - An R2 object counts only once its D1 row exists. Reads check D1 first, so an orphaned object is never served.
  - A retried publish that finds an object with no row deletes it and writes again.
- **2026-10-08, accepted risk.** The create-only conditional put that enforces immutability uses R2 behaviour that Cloudflare does not document, and local emulation has a reported bug with it. It was decided not to require verification against a real bucket before publishing ships.
