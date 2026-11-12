# ADR 0001: Build from scratch on the `mvp` branch

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf. The branch rule is superseded by [ADR 0012](0012-work-on-main.md): work now happens on `main`, and `mvp` and `p-o-c` are deleted.

## Decision

Durables is built from scratch on the `mvp` branch, created from an empty `main`. No code from the proof of concept (the `p-o-c` branch) is reused. The `p-o-c` branch stays in the repository as history and is never merged.

## Why

The proof of concept served its purpose: it proved the idea and surfaced what production needs (see the shortcut ledger on P-POC-145). It was built on a different stack (Fastify, PostgreSQL, documents on local disk, Docker) from the one chosen for production, and the product was redesigned after it was built. Carrying its code forward would mean reworking nearly every file while inheriting its shortcuts.

## Consequences

- Every surface starts empty. Conventions are written before any code, from these records and the business requirements.
- The proof of concept remains a reference for _how_ detection, pattern checks, snippet templates and version suggestions behaved. Its API maps (POC-4 to POC-11) describe behavior, not contracts.
- Nothing on `main` matters until the first release is merged there.
