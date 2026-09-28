# testing conventions (PoC)

This is a proof of concept. These conventions cover structure only. They are
rewritten if the PoC graduates.

testing is the demo environment. It has four parts, and each has its own
directory:

| Directory        | What it is                                             |
| ---------------- | ------------------------------------------------------ |
| `mock-payments/` | the mock payments API, standing in for a real provider |
| `temporal/`      | the local Temporal dev server                          |
| `seed/`          | seeded and demo activities, and the script that publishes them |
| `consumer/`      | the empty consumer project for steps 11 and 12         |

## Layering

### mock-payments/

TypeScript, Fastify, ESM, with its own `package.json`.

`src/server.ts` → `src/routes/charges.ts`, `src/routes/refunds.ts` →
`src/store.ts`. Calls go downward only. The store is in memory. No database,
no files.

Its container is defined here, not in infrastructure: `mock-payments/Dockerfile`
and `mock-payments/compose.yaml` (service `mock-payments`, host port 4000).

### temporal/

One `compose.yaml` (service `temporal`) running the `temporalio/temporal` image with
`server start-dev`: gRPC on 7233, UI on 8233, the `default` namespace. No
other Temporal setup lives anywhere.

### seed/

    seed/
      package.json
      publish-seeds.ts
      catalog/<sdk>/<name>/      the eight seeded activities
      demo/refund-charge/        published before the demo
      demo/charge-card/v1/       pasted by hand in step 1
      demo/charge-card/v2/       pasted by hand in step 13

`<sdk>` is `python`, `typescript` or `dotnet`. Every activity directory holds
exactly three files:

- the activity, as one file named the SDK's way: `charge_card.py`,
  `charge-card.ts`, `ChargeCard.cs`
- `declaration.json`: the declaration form answers (tags with cited lines,
  compensation address, heartbeat reason, environment variable purposes)
- `README.md`: written under the headings of api's README template

Seeds have no project files (`pyproject.toml`, `package.json`, `.csproj`).
Only the two Python demo activities are ever run, in the consumer project.

`publish-seeds.ts` runs with `tsx`. It publishes everything in `catalog/`,
plus `demo/refund-charge/`, as the publisher user. It does not publish
`demo/charge-card/`.

### consumer/

Only `README.md` and `reset.sh` are tracked. `reset.sh` (bash, which runs in
Git Bash on Windows) recreates an empty `.venv` and deletes any pasted files.
Everything else in the directory is gitignored.

## Boundaries

testing reaches api only over HTTP, using the contract in the epic's API map.
The seed script publishes through the same paste flow a publisher uses,
because that flow is part of what the demo tests.

testing owns the Temporal and mock-payments containers. infrastructure's
compose file includes them. It does not redefine them.

### Mock payments contract

- Auth: `Authorization: Bearer <MOCK_PAYMENTS_API_KEY>`.
- `Idempotency-Key` header: a repeated key returns the original charge.
- One fixed test card number always declines.
- Activities that call it read exactly two environment variables:
  `MOCK_PAYMENTS_URL` and `MOCK_PAYMENTS_API_KEY`.

### Stubs

| Faked                     | Where                                                   |
| ------------------------- | ------------------------------------------------------- |
| External payment provider | `mock-payments/`                                        |
| Consumer's credentials    | the two variables above, set in the demo shell          |
| Catalog volume            | `seed/catalog/`, published through the real paste flow  |

## Naming

- Directories and TypeScript files: kebab-case.
- Seed activity files: the SDK's naming, as above.
- A new seeded activity is a new `seed/catalog/<sdk>/<name>/` directory,
  where `<name>` is the kebab-case listing name.
- A new mock-payments endpoint is a new `mock-payments/src/routes/<resource>.ts`.

## Tests

Tests are optional on this PoC; the demo gate verifies it. If you write one:

- Only in `mock-payments/`. Vitest, colocated as `<file>.test.ts`.
- Run with `npm test` in `testing/mock-payments/`.
- Seeds and scripts get no tests.

## Shortcuts

Every shortcut is marked where it lives, with a comment in the file's own
syntax:

    POC-SHORTCUT: SC-###

and has a row in the project's shortcut ledger. A marker with no row, or a
row with no marker, is a defect. Prefer a stub behind a real interface over a
real integration anything on the faked-by-design list names.

## Never

- Write to the database or `DOCUMENTS_DIR` directly, or import from `api/`
  or `web/`.
- Give a seed more than one file of activity code, or any dependency beyond
  its SDK.
- Have the seed script publish `demo/charge-card/`.
- Use credential variable names other than `MOCK_PAYMENTS_URL` and
  `MOCK_PAYMENTS_API_KEY`.
- Call Claude or any other AI or LLM.
- Add a dependency without naming it in the hand-back.
