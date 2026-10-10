# Durables

A community registry of Temporal activities, at [durables.dev](https://durables.dev). Not affiliated with Temporal Technologies.

## Layout

| Folder            | What it is                                                      |
| ----------------- | --------------------------------------------------------------- |
| `web/`            | The website: TypeScript, React, Vite                            |
| `api/`            | The API: TypeScript, Hono on Cloudflare Workers, with D1 and R2 |
| `infrastructure/` | Everything deployed, defined with CDK Terrain                   |
| `e2e/`            | End-to-end browser tests with Playwright                        |
| `docs/adr/`       | Architecture decision records: start here                       |
| `docs/`           | Brand guide and logo files                                      |

Each surface has a `CONVENTIONS.md` with the rules for working in it.

## Running locally

Everything runs in a dev container (see `docs/adr/0011-development-container.md`). You need Docker and one of:

- VS Code with the Dev Containers extension: **Reopen in Container**
- A JetBrains IDE: open `.devcontainer/devcontainer.json` and choose **Create Dev Container**
- The CLI: `npx @devcontainers/cli up --workspace-folder .`, then `npx @devcontainers/cli exec --workspace-folder . bash`

No Cloudflare account is needed. The first start installs dependencies, the Playwright browser and the Cloudflare provider bindings, which takes a few minutes. Then, inside the container:

```
npm run dev:api     # the Worker, with local D1 and R2, on http://localhost:8787
npm run dev:web     # the website on http://localhost:5173, proxying /api to the Worker
npm run e2e         # end-to-end tests against both
```

Both ports are forwarded to your machine. Installed packages and local D1/R2 data live in Docker volumes, not in your checkout; rebuilding the container keeps them.

## Branches

`mvp` is the default branch: branch from it and open pull requests into it. `main` is the release branch. It receives `mvp` once at the first release, and merging to it deploys to production (`docs/adr/0001-fresh-start.md`).

## Deploying

Everything deployed is defined in `infrastructure/` (see `docs/adr/0003-infrastructure-as-code.md`). Merging to `main` deploys through the GitHub Actions workflow in `.github/workflows/ci.yml`, which runs the same dev container.

To deploy by hand from the container, with the same environment variables the workflow uses (`CLOUDFLARE_API_TOKEN`, the R2 state token as `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, `AWS_SSE_CUSTOMER_KEY`, and the `TF_VAR_*` secrets):

```
npm run build
npm run diff --workspace infrastructure     # review the plan
npm run deploy --workspace infrastructure
```

Two things exist outside `infrastructure/`, set once in the Cloudflare dashboard: the R2 bucket that holds Terraform state, and the Workers Paid subscription with its budget alert (ADR 0002).
