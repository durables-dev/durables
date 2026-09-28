# infrastructure conventions (PoC)

This is a proof of concept. These conventions cover structure only. They are
rewritten if the PoC graduates.

infrastructure runs the whole PoC locally with Docker Compose. One command
starts everything:

    docker compose -f infrastructure/compose.yaml up

## Layering

    infrastructure/
      compose.yaml             the single entry point
      .env.example             every variable, with a safe local value
      docker/web.Dockerfile    build context ../web
      docker/api.Dockerfile    build context ../api

`compose.yaml` defines `web`, `api` and `postgres`, and pulls in testing's
containers with `include:`. Nothing else starts the stack.

### Services

| Service         | Image or build                                     | Host port  |
| --------------- | -------------------------------------------------- | ---------- |
| `web`           | `docker/web.Dockerfile`                            | 5173       |
| `api`           | `docker/api.Dockerfile`                            | 3000       |
| `postgres`      | `postgres:16`                                      | 5432       |
| `temporal`      | included from `testing/temporal/compose.yaml`      | 7233, 8233 |
| `mock-payments` | included from `testing/mock-payments/compose.yaml` | 4000       |

Every port is published to the host, because the consumer's worker and
starter run on the host in step 11.

### Run mode

web and api run in dev mode, with their source bind-mounted:

- web: the Vite dev server with `--host`. `VITE_API_TARGET=http://api:3000`
  feeds the `/api` proxy described in web's conventions.
- api: `tsx watch src/server.ts`.

No production builds, no nginx.

## Boundaries

infrastructure owns the Compose file, the Dockerfiles for web and api, the
volumes, and `.env.example`. It holds no application code and no application
config. Each surface keeps its own `package.json`, and infrastructure only
builds from it.

testing owns the `temporal` and `mock-payments` definitions.
infrastructure includes them and never redefines or overrides them.

Seeding is not containerized. After `up`, `testing/seed`'s publish script is
run from the host against `http://localhost:3000`. infrastructure only
guarantees that api is reachable there.

### Volumes

| Volume               | Mounted in               | Purpose                                        |
| -------------------- | ------------------------ | ---------------------------------------------- |
| `durables-documents` | api, at `/data/documents` | activity and group version documents (`DOCUMENTS_DIR=/data/documents`) |
| `durables-postgres`  | postgres                 | the database                                   |

`docker compose -f infrastructure/compose.yaml down -v` resets both to empty.

### Stubs

| Faked            | Where                                                             |
| ---------------- | ----------------------------------------------------------------- |
| Document storage | the `durables-documents` volume, marked in `compose.yaml`         |
| Hosting          | the whole stack on localhost with published ports, marked in `compose.yaml` |

### Environment

Variables come from `infrastructure/.env` (gitignored), copied from
`.env.example`. The starting set:

| Variable                                          | Used by          |
| ------------------------------------------------- | ---------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | postgres       |
| `DATABASE_URL`                                    | api              |
| `DOCUMENTS_DIR`                                   | api              |
| `VITE_API_TARGET`                                 | web              |
| `MOCK_PAYMENTS_API_KEY`                           | mock-payments    |

## Naming

- Files: `compose.yaml`, `docker/<service>.Dockerfile`.
- Services: kebab-case, matching the table above.
- Volumes: `durables-<purpose>`.
- Environment variables: SCREAMING_SNAKE. Every one appears in
  `.env.example`.

## Tests

Tests are optional on this PoC; the demo gate verifies it. There are none on
this surface. To check a change:

    docker compose -f infrastructure/compose.yaml config

## Shortcuts

Every shortcut is marked where it lives, with a comment in the file's own
syntax:

    POC-SHORTCUT: SC-###

and has a row in the project's shortcut ledger. A marker with no row, or a
row with no marker, is a defect. Prefer a stub behind a real interface over a
real integration anything on the faked-by-design list names.

## Never

- Put application code or application config in `infrastructure/`.
- Bake secrets into an image. They come from `.env` only.
- Add a service or host port not in the table without naming it in the
  hand-back.
- Redefine or override a service included from `testing/`.
- Add hosting, TLS or cloud resources. They are faked by design.
