# api conventions (PoC)

This is a proof of concept. These conventions cover structure only. They are
rewritten if the PoC graduates.

Stack: TypeScript on Node, Fastify, ESM, npm with its own `api/package.json`.
Entry point: `src/server.ts`.

## Layering

Top to bottom:

1. `src/routes/`: Fastify route plugins. Parse the request, call one service,
   shape the response. No logic.
2. `src/services/`: use cases (`activities`, `groups`, `search`, `accounts`).
   Orchestrate domain functions, storage and db.
3. `src/domain/`: pure functions, no I/O.
   - `detection/`: regex detection per SDK
   - `patterns/`: the regex rubric for pattern checks
   - `snippets/`: snippet generation and templates
   - `versioning/`: signature comparison and version suggestion
   - `groups/`: group resolution, read-only blocks, import merging
4. `src/storage/` (documents), `src/db/` (Postgres), `src/auth/`,
   `src/search/`: I/O, reached only from services.

Calls go downward only. Routes call services. Services call domain, storage,
db, auth and search. Domain imports only `src/model/`. Nothing calls upward,
and routes never reach past services.

`src/model/` holds the document and row types (`ActivityVersion`,
`GroupVersion`, `Account`, and so on). Every layer may import it.

### Per-SDK code

Each SDK has one file per concern, behind a shared interface:

- `src/domain/detection/{python,typescript,dotnet}.ts`, each implementing
  `Detector`.
- Snippet templates are plain files at
  `src/domain/snippets/templates/<sdk>/{install,workflow,worker,starter}.tmpl`,
  where `<sdk>` is `python`, `typescript` or `dotnet`. Placeholders are
  `{{name}}`, filled by a small in-house function. No template library. The
  activity tab is the pasted code itself and has no template.

## Boundaries

api owns the HTTP API (the epic's API map), the Postgres schema and the
document store. It does not import from `web/` or `testing/`. `web` and
`testing` reach api only over HTTP.

### Database

- The `pg` package with plain SQL, only in `src/db/<table>-repository.ts`. No
  ORM.
- Migrations are numbered `.sql` files in `api/db/migrations/`
  (`001-accounts.sql`, `002-ownership.sql`, …). api runs them on startup.
- The database holds accounts, plumbing, and the table linking accounts to
  the activities and groups they own. Code and metadata live in documents,
  not in the database.

### Documents

All document access goes through the `DocumentStore` interface in
`src/storage/document-store.ts`. Layout under `DOCUMENTS_DIR`:

    activities/<owner>/<name>/<version>.json
    groups/<owner>/<name>/<version>.json

Versions are immutable. `DocumentStore` has no update or delete for a
version.

### Stubs

Each stub from the faked-by-design list sits behind the interface the real
integration will use, so replacing it does not touch callers:

| Faked               | Interface                                 | Stub                                    |
| ------------------- | ----------------------------------------- | --------------------------------------- |
| Document storage    | `DocumentStore` (`storage/document-store.ts`) | `storage/disk-document-store.ts`    |
| Accounts, sign-in   | `AuthProvider` (`auth/auth-provider.ts`)  | `auth/hardcoded-auth.ts`: two fixed users, selected by the `X-Durables-User` header |
| Search              | `SearchIndex` (`search/search-index.ts`)  | `search/document-scan-search.ts`: reads documents directly |
| Verified badge      | column on `accounts`                      | set by the migration that inserts the two users |
| Store consistency   | —                                         | the non-transactional document-then-row write in the publish service, marked where it happens |

## Naming

- Files and directories: kebab-case.
- Types and interfaces: PascalCase. Functions and variables: camelCase.
- Named exports only. No default exports.
- A new resource adds `src/routes/<resource>.ts` and
  `src/services/<resource>.ts`, with the same resource name in both.
- New pure logic goes in the matching `src/domain/<concern>/` directory.
- A new repository is `src/db/<table>-repository.ts`.

## Tests

Tests are optional on this PoC; the demo gate verifies it. If you write one:

- Vitest, colocated as `<file>.test.ts` next to the file under test.
- Fixture activity files go in `api/test-fixtures/<sdk>/`.
- Run with `npm test` in `api/` (`vitest run`).

## Shortcuts

Every shortcut is marked where it lives, with a comment in the file's own
syntax:

    POC-SHORTCUT: SC-###

and has a row in the project's shortcut ledger. A marker with no row, or a
row with no marker, is a defect. Prefer a stub behind a real interface over a
real integration anything on the faked-by-design list names.

## Never

- Read or write files outside `DocumentStore`, or run SQL outside `src/db/`.
- Import from `web/` or `testing/`.
- Call Claude or any other AI or LLM.
- Add a dependency without naming it in the hand-back.
- Change or delete a published version's document.
