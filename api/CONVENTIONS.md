# api conventions

The rules for working in `api/`: the Hono API on Cloudflare Workers, with D1 and R2. Read with the ADRs in `docs/adr/`.

## Status

- Branch from `mvp` and open pull requests into `mvp`. `main` is the release branch, and merging to it deploys to production (ADR 0001).
- `src/index.ts` and `src/dev.ts` are bootstrap code. Only the `/api/health` route is real. Nothing else in `src/` is precedent to copy.
- The tooling configuration is real: `tsconfig*.json`, `vitest.config.ts`, `wrangler.toml`, and the root `eslint.config.mjs`, `.prettierrc.json` and `tsconfig.base.json`.

## Orientation

- Start at `src/index.ts`, the production entry point, and `src/dev.ts`, the local entry point.
- There is no reference resource yet. The first vertical slice's resource folder becomes the shape to mirror, and is named here when it lands.

## Tooling is the style guide

- Formatting, lint and type rules are enforced by tools, not restated here. `npm run format:check`, `npm run lint` and `npm run typecheck` must pass.
- Prettier with its defaults (2-space indentation, double quotes). Nobody formats by hand; run `npm run format`.
- typescript-eslint `recommended-type-checked` plus `stylistic-type-checked`, on top of ESLint's recommended rules. Object types are `interface`s, as `stylistic` defaults.
- TypeScript 6.0, with the base config extending `@tsconfig/strictest`.

## Where things go

- One folder per resource, named in kebab-case: `src/activities/`, `src/accounts/`. It holds the resource's Hono sub-app, its Zod request and response schemas, and its related logic. Each sub-app is mounted in `src/index.ts` with `app.route()`.
- `src/storage/` holds the storage interface over D1 and R2 (ADR 0005), including the Drizzle schema.
- `src/auth/` holds the auth interface (ADR 0007).
- `src/checks/` holds the checks pipeline (ADR 0008). Every detection pattern is a named, documented regex, because the patterns are published as the rubric. No ad hoc regex in handlers or elsewhere.
- `src/snippets/` generates the Implement snippets from detection results at publish time (ADR 0008). Its templates are plain text files, not TypeScript, so Prettier never touches them, and they use 4-space indentation as DUR-2 requires of displayed code.
- File names are kebab-case: `version-document.ts`.
- Tests sit next to the code they test. Unit tests are `*.test.ts`; integration tests are `*.integration.test.ts`.
- Local-only code, such as the fake sign-in provider (ADR 0004), is mounted in `src/dev.ts` only. `wrangler.toml` points at `src/dev.ts`; the production build names `src/index.ts`.

## Hono

- Handlers are written inline in the route chain, never as separate controller functions.
- Routes are chained calls, and so are the `app.route()` calls that mount sub-apps, so every route's type reaches `web` through `AppType`.
- Bindings are typed by the generated `CloudflareBindings`. Per-request values set by middleware are typed through the `Variables` generic.
- API 404s are handled by `app.notFound` on the top-level app. It does not fire on sub-apps.
- `secureHeaders()` runs on every API response. Page headers are `web`'s job (`web/public/_headers`), because pages never pass through the Worker.
- **Every non-GET request must come from our origin.** A middleware rejects any request whose `Sec-Fetch-Site` header is not `same-origin` (or `none` for a direct navigation) with 403, before any handler runs.
- **The session** is a signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookie with the `__Host-` prefix, set through Hono's cookie helper. Reading the session for an anonymous visitor returns 200 with no user; 401 is only for endpoints that require one.
- Publishing and the detection preview run behind `bodyLimit`, with the limit a named constant in one place. Publishing and the preview are also rate-limited through the `PUBLISH_LIMIT` and `PREVIEW_LIMIT` bindings (ADR 0006): the handler calls `limit({ key })` and answers 429 Problem Details when refused. The key is the session for publishing and the client IP (`cf-connecting-ip`) for the preview. The limits live in `wrangler.toml`, which `infrastructure/` reads.
- Caching is the API's job (ADR 0006). Version endpoints return only immutable fields, are stored through Hono's `cache` middleware and carry `Cache-Control: public, max-age=31536000, immutable`. Listing endpoints carry the mutable fields and `Cache-Control: public, max-age=0, s-maxage=60`: the edge caches briefly, the browser always revalidates. No version endpoint includes a mutable field. Search and browse responses, the session endpoint and every mutation response are `no-store`: search reads the D1 index on every request, so a changed description shows in results right away.

## API surface

- **Paths** are resource-style: plural nouns, kebab-case, nested by ownership. For example, `/api/activities/:handle/:name/versions/:version`.
- **No API versioning:** no `/v1` prefix and no version header.
- **No envelope.** A successful response returns the resource or list directly.
- **Pagination is cursor-based.** A list response carries an opaque `nextCursor`, and the client sends it back for the next page. There is no offset pagination.
- **Errors are RFC 9457 Problem Details** (`application/problem+json`). One shared helper builds every error response. `app.onError`, `app.notFound` and the validation hook all use it.
- **Status codes:**

  | Code | When                                                                                  |
  | ---- | ------------------------------------------------------------------------------------- |
  | 200  | A read                                                                                |
  | 201  | A successful publish, with `Location` pointing at the new version                     |
  | 204  | Nothing to return, such as signing out                                                |
  | 400  | A malformed request, including schema validation failure                              |
  | 401  | Not signed in                                                                         |
  | 403  | Signed in but not allowed, such as publishing under someone else's handle             |
  | 404  | The resource does not exist                                                           |
  | 409  | Conflicts with existing state: the version address exists, or the handle is taken     |
  | 413  | The body is too large                                                                 |
  | 422  | Well-formed but unacceptable content, such as a pasted file containing two activities |
  | 500  | Only an unexpected failure. Never anything we can anticipate                          |

  | 429 | A rate-limit binding refused the request (ADR 0006) |

- **Shared types are Hono RPC** (ADR 0010).
  - `src/index.ts` exports `type AppType = typeof app`.
  - `web` calls the API through `hc<AppType>`.
  - `web` reads `AppType` from the declarations `npm run build:types` emits to `dist-types/`, never from `api`'s source.
  - Hono is pinned to the same exact version in `api` and `web`.
  - Problem Details is declared globally with `ApplyGlobalResponse`, so `web`'s client sees it on every route.

## Data access

- Drizzle is the access layer for D1.
- Only `src/storage/` touches D1, R2, Drizzle, or the `DB` and `DOCUMENTS` bindings. One middleware, registered in `src/index.ts`, builds the storage from `c.env` and sets it on `c.var.storage`. Handlers and resource folders call `c.var.storage` and never read the bindings themselves.
- **Migrations** are generated by `drizzle-kit generate` into `api/migrations/`, and Wrangler applies them.
  - A generated migration is never hand-edited.
  - SQL that Drizzle cannot express goes in a separate custom migration (`drizzle-kit generate --custom`).
  - An applied migration is never edited.
- **Publishing writes R2 first, then D1** (ADR 0005).
  - If the R2 create-only write fails, nothing is written to D1, and the publish fails.
  - If the D1 write fails, the publish fails, and the R2 object is deleted right away.
  - An R2 object counts only once its D1 row exists. Reads check D1 first, and an R2 object with no row is never served.
  - A retried publish that finds an object with no row deletes it and writes again.

## Validation and errors

- Requests are validated with Zod through `@hono/zod-validator`. A validation failure returns a 400 Problem Details response through the shared helper, with an `errors` extension: `[{ field, message }]`, one entry per failing field, so `web` can show them inline.
- The handle schema in `@durables/schemas` rejects the reserved words that are `web`'s top-level routes. `api` never defines its own list.
- A schema that `web` also validates (handle format, listing details, the publish confirmations) lives in `packages/schemas` (`@durables/schemas`) and is imported from there, never duplicated. Schemas only `api` uses stay in the resource folder.
- An anticipated failure throws a typed `ProblemError` carrying its status and Problem Details type. `app.onError` turns it into the response.
- Anything else that throws is unexpected, and becomes a 500 through `app.onError`.

## Logging

- One structured object per log line, never a concatenated string.
- `console.warn` for a recoverable failure. `console.error` only where someone should act.
- No routine logging of successful requests; Workers Logs records each request.
- Every log line carries the request ID.
- **Never logged, at any level, including inside error messages:**
  - session tokens
  - OAuth codes and tokens
  - client secrets
  - the session signing key
  - email addresses
  - published code

## Configuration and secrets

- Bindings, variables and secrets are read only through `c.env`, and only in the middleware that builds storage and auth and sets them on `c.var`. Handlers use `c.var`.
- Nothing is read or cached at module level. No `process.env`, and no `import { env } from "cloudflare:workers"`.
- After changing `wrangler.toml`, run `npm run types` and commit `worker-configuration.d.ts`. `npm run types:check` must pass.
- `wrangler.toml` must name the same bindings, `compatibility_date` and compatibility flags that `infrastructure/` defines (ADR 0004). A change to either is reviewed against the other.

## Dependencies

- **Approved packages:**
  - `hono`
  - `zod`, `@hono/zod-validator` and `@durables/schemas`
  - `drizzle-orm` and `drizzle-kit`
  - `@hono/oauth-providers`. Its GitLab flow is hand-written alongside it, because the package has none.
  - `wrangler`
  - `vitest`, `@cloudflare/vitest-plugin` and `@msw/cloudflare`
- Adding any other package is an architect decision. Stop and raise it as a question; do not add it.
- Build, lint and test tooling is the architect's and is outside this list.

## Async and concurrency

- Every promise is awaited, returned, or passed to `ctx.waitUntil`.
- `ctx.waitUntil` is only for work whose failure the caller does not need to know about, such as deleting an orphaned R2 object.

## Test levels

- **Unit tests** (`*.test.ts`) run in plain Vitest under Node. They cover pure logic such as detection patterns, checks and cursor encoding, and touch no bindings.
- **Integration tests** (`*.integration.test.ts`) run in the Workers runtime through `@cloudflare/vitest-plugin`.
  - They use real local D1 and R2 with migrations applied, and send requests to the app over HTTP (`exports.default.fetch` from `cloudflare:workers`).
  - They run the Worker `wrangler.toml` names, which is `src/dev.ts`.
  - Only the outside world is faked: the OAuth providers' endpoints are mocked with MSW (`@msw/cloudflare`).
  - D1, R2 and internal modules are always real.
- **Commands:**
  - `npm test` in `api` runs both levels.
  - `npm run test:unit` and `npm run test:integration` run one level alone.
  - The root `npm test` runs every surface.
- Before handing back, run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run types:check`, `npm test` and `npm run build`.
- **Deliberately not tested here:**
  - Browser flows and anything spanning pages. They live in `e2e/`.
  - Edge cache behaviour. Tests assert the cache headers a response carries, not that the edge honoured them.
- **Owed to `e2e`:**
  - The local fake sign-in provider stays usable for signing in, and signs in as any identity the caller names, so each test worker gets its own account. Its sign-in route and behaviour do not change without changing `e2e`.
  - `/api/health` keeps returning `{ ok: true }`. `e2e` waits on it to know the Worker is up.
  - The publish endpoints stay callable without the browser, through Playwright's `request` fixture with the session cookie, so tests can create data without clicking through the wizard.
- **Owed by `infrastructure`:** the Worker enables Workers Logs, which the logging rules rely on, and carries the same bindings, rate limits, `compatibility_date` and flags as `wrangler.toml`, which it reads (ADR 0003, 0004).
- **Owed to `infrastructure`:** `wrangler.toml` is the source it reads. The nine secret and client-ID binding names are listed in `infrastructure/main.ts`; the sign-in story declares the same names locally so they are typed.

## Deliberately the specialist's call

- How a handler or storage function is split into smaller functions, and local variable names.
- Whether a helper stays private to its file or gets its own file within the resource folder.
- How Drizzle queries are written, as long as they live in `src/storage/`.
- Which test cases to add beyond the story's acceptance criteria.
- The exact wording of Problem Details `title` and `detail` messages.

## Never in this codebase

1. A route handler defined outside its route chain, as a separate controller function.
2. D1, R2 or Drizzle touched anywhere outside `src/storage/`.
3. Configuration read anywhere but `c.env`, or request data or bindings kept in module-level variables. No `process.env`.
4. An edited generated or applied migration.
5. A package that isn't on the approved list.
6. Anything on the never-log list in a log.
7. A 500 for an anticipated failure, or an error body that isn't Problem Details.
8. The fake sign-in provider, or anything from `src/dev.ts`, imported into the production entry point.
9. D1, R2 or an internal module faked in an integration test.
10. `Math.random()` for anything security-related, or tokens compared without a constant-time comparison.
11. An inline `eslint-disable` without a comment explaining why.
12. A weakened compiler or lint setting to make code pass.
13. A `node:` import, or the `nodejs_compat` flag. The Workers runtime is the only runtime (ADR 0002); tests run with `nodejs_compat` injected, so passing tests prove nothing here.
14. Detection results accepted from the client. The publish-time run is the only one stored (ADR 0008).
15. A mutable field in a version endpoint's response.
16. A state-changing handler reachable without the origin check.
