# ADR 0010: Surfaces and stacks

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf.

## Decision

The repository has four surfaces, each a folder at the root with its own conventions, dependencies and commands.

| Surface          | Folder            | Stack                                                  | Holds                                                                                                                                     |
| ---------------- | ----------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Website          | `web/`            | TypeScript, React, Vite                                | The pages: home, search results, activity page, contribute flow, Terms, Privacy and Security. Built to static assets served by the Worker |
| API              | `api/`            | TypeScript, Hono on Cloudflare Workers                 | Routes, sign-in and sessions, publishing, detection and checks, snippet generation, the storage interface over D1 and R2, D1 migrations   |
| Infrastructure   | `infrastructure/` | TypeScript, CDK Terrain, Cloudflare Terraform provider | Everything deployed (ADR 0003)                                                                                                            |
| End-to-end tests | `e2e/`            | TypeScript, Playwright                                 | Browser tests against the local stack (ADR 0004), starting with publish-then-find-then-copy                                               |

All four are TypeScript, managed as one workspace from the repository root so they share a package manager, TypeScript version and lint rules.

## Why

The surfaces match how the work divides: a site, an API, the definition of the deployed system, and tests that cross all three. One language across them keeps tooling simple and lets `web` and `api` share types for the API contract. Hono is chosen for `api` because it is built for the Workers runtime; React and Vite for `web` because the designs assume a single-page site talking to a separate API; Playwright for `e2e` because it drives a real browser against the local stack.

## Consequences

- Each surface gets its own `CONVENTIONS.md`, written before any code, from these records and the business requirements.
- Shared API types live where both `web` and `api` can import them. **Open:** whether that is a package in the workspace or a folder `web` imports from `api`, decided in the conventions.
- The brand guide and logo files in `docs/` are the source for `web`'s visual identity.
- `e2e` depends on all three other surfaces running locally; it is dispatched after the first vertical slice exists in `web` and `api`.

## Notes

- **2026-10-08, shared API types decided** in `api/CONVENTIONS.md`.
  - `web` imports `AppType` from `api` and calls the API through Hono's typed client, which is the "folder `web` imports from `api`" option.
  - `web` reads the declarations `api` emits to `api/dist-types/`, never `api`'s source.
  - Hono is pinned to the same exact version in both surfaces.
- **2026-10-08, shared tooling.** The shared TypeScript version, lint rules and formatter are set at the repository root:
  - TypeScript 6.0, with the base config extending `@tsconfig/strictest`
  - typescript-eslint `recommended-type-checked` plus `stylistic-type-checked`
  - Prettier with its defaults
- **2026-10-08, shared schemas.** `web` validates forms with the same Zod schemas `api` validates requests with, so those schemas live in a fifth workspace member, `packages/schemas` (`@durables/schemas`). It is a library, not a surface: it has no conventions file of its own, holds nothing but schemas, and imports nothing from the Workers runtime or the DOM. Decided in `web/CONVENTIONS.md`.
