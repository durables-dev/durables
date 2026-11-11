# infrastructure conventions

The rules for working in `infrastructure/`: the CDK Terrain project that defines everything Durables deploys, with the Cloudflare Terraform provider. Read with the ADRs in `docs/adr/`, above all 0003.

## Status

- Branch from `mvp` and open pull requests into `mvp`. `main` is the release branch, and merging to it deploys to production (ADR 0001).
- `main.ts` and `src/` are real: the stack, its backend, and one construct per concern are the shape to mirror. The Cloudflare account and zone IDs are deploy-time variables, not constants in `src/config.ts`.
- Nothing has been deployed yet. The first `cdktn deploy` is the first time this code meets Cloudflare; its `diff` is reviewed line by line.

## Orientation

- Start at `main.ts`: the backend, the provider, the variables, and the constructs it composes. Then `src/worker.ts`, the construct with the most going on, and its test.

## Tooling is the style guide

- The shared tooling applies: Prettier, typescript-eslint, TypeScript 6 with `@tsconfig/strictest`. `npm run format:check`, `npm run lint` and `npm run typecheck` must pass.
- CDK Terrain 0.24.0 and its CLI are pinned exactly and upgraded together. The Cloudflare provider is pinned exactly in `cdktf.json`; `npm run get` regenerates `.gen/`, which is never committed.
- Two strictest flags, `exactOptionalPropertyTypes` and `noImplicitOverride`, are off in this surface's `tsconfig.json` because the generated bindings cannot satisfy them. That is the only relaxation, and it is not extended to anything else.
- `cdktf.json` sets `validateInstalledBinary`, so `diff` and `deploy` refuse a Terraform older than the lockfile-locking floor.

## Where things go

- One construct per concern in `src/`, named for what it holds: `storage.ts` (D1 and R2), `worker.ts` (worker, version, deployment, bindings, assets, observability), `domain.ts`, `analytics.ts`, `migrations.ts`. `main.ts` composes them and declares every variable; constructs never declare variables themselves.
- `src/config.ts` holds every non-secret value that is this project's own: names and the hostname. A construct never hard-codes a name.
- The Cloudflare account and zone IDs are not secret but are kept out of the repo. `main.ts` declares them as plain `TerraformVariable`s (`cloudflare_account_id`, `cloudflare_zone_id`) and passes them to each construct as props.
- `src/wrangler-config.ts` reads `api/wrangler.toml` at synth. The compatibility date, flags, binding names and rate limits come from there, never from a second copy here (ADR 0004).
- One stack, `durables`, production only. There is no staging environment; the dev container is the pre-production environment (ADR 0011).
- Tests sit next to the construct: `storage.test.ts` beside `storage.ts`.
- Imports from `.gen/` are deep: `../.gen/providers/cloudflare/worker-version`, never a star import of the provider.

## Resources

- The Worker is `cloudflare_worker` + `cloudflare_worker_version` + `cloudflare_workers_deployment` (ADR 0003). Every apply that changes the version's inputs creates a new immutable version and deploys it at 100%.
- The API bundle (`api/dist/`) and the site (`web/dist/`) are `TerraformAsset`s. They are built at the root before synth; this project never builds them. `web/public/_headers` is uploaded as a module named `_headers`, as Cloudflare requires.
- Workers Logs is enabled on the Worker, with invocation logs. `api`'s logging rules depend on it.
- Rate limits are `ratelimit` bindings, read from `api/wrangler.toml` (ADR 0006).
- The custom domain is the apex, proxied. `web`'s CSP and the API's Cache API assume it.
- Web Analytics is created with auto-injection off; its `site-token` output is what `web/index.html`'s beacon uses (ADR 0009).
- Construct ids are stable. Renaming one on an existing resource uses `moveTo`, because the Terraform address derives from the id and a plain rename destroys and recreates the resource.

## Migrations

- `src/migrations.ts` runs `wrangler d1 migrations apply durables --remote` from the deploying machine through a `terraform_data` step, triggered by the hash of `api/migrations/*.sql`, and the Worker version depends on it, so the schema changes before new code serves (ADR 0003).
- A migration is additive within a release. Renaming or dropping anything the deployed code uses waits for a later release.
- The step is the only Wrangler command that touches production.

## Configuration and secrets

- Secrets are sensitive `TerraformVariable`s declared in `main.ts` and supplied as `TF_VAR_*` environment variables at deploy. Provider and backend settings (`CLOUDFLARE_API_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SSE_CUSTOMER_KEY`, and `AWS_ENDPOINT_URL_S3`, the R2 endpoint `https://<account-id>.r2.cloudflarestorage.com`) are read by Terraform, never by TypeScript. A backend cannot read Terraform variables, so the endpoint is an environment variable.
- Nothing in TypeScript reads the environment or a file for a secret, token or ID. What TypeScript reads lands in `cdktf.out`.
- State is in R2 (`S3Backend` in `main.ts`), with lockfile locking and a customer-supplied encryption key. The state bucket and its token exist outside this project and are created by hand. Reading state is reading production's secrets; the token is scoped to that bucket alone.
- The deploy token carries only what the resources need: Workers, D1 (including write, for migrations), R2, DNS, Account Settings (analytics). The R2 state token is a separate token.

## Deploying

- `npm run build` at the root, then `npm run diff --workspace infrastructure`, review, then `npm run deploy --workspace infrastructure`. A deploy without a reviewed diff does not happen.
- Merging to `main` deploys through `.github/workflows/ci.yml`, in the dev container, after every check passes. Before merging, run the **Plan** workflow (`.github/workflows/plan.yml`) from the Actions tab: it runs `diff` against production with the deploy's own settings and never deploys. Its log is the reviewed diff for CI deploys.
- Only this project changes Cloudflare resources. The exceptions, owned by the dashboard, are the state bucket, the Workers Paid subscription and the budget alert (ADR 0002).

## Dependencies

- A specialist may add a package when it is needed to express a resource or a CDK Terrain feature, and says so in the story's report.
- Adding a Terraform provider is an architect decision, because it widens what the deploy token can reach.

## Test levels

- **Synth tests** (`src/*.test.ts`) run in Jest with CDK Terrain's matchers: each construct synthesizes alone through `Testing.synthScope` and the test asserts the resources and properties it produces.
- `worker.test.ts` asserts the version's compatibility date and binding names against `api/wrangler.toml`, so drift between the two fails the build (ADR 0004).
- **Commands:** `npm test` in `infrastructure`. The root `npm test` includes it.
- `npm run lint`, `npm run typecheck` and `npm test` all import `.gen/`. The dev container's post-create step generates it; in any other environment, or if it is missing, run `npm run get` first. A missing `.gen/` is a setup step to run, not a failure to report.
- Before handing back, run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run synth`, then `terraform validate` on `cdktf.out/stacks/durables` after `terraform init -backend=false`, which checks attribute names against the real provider schema.
- **Deliberately not tested here:** that resources behave once created, which `api`'s tests and the deployed site cover; the migration step, which only runs in a real deploy.
- **Owed to `api`:** the Worker's bindings, compatibility date and flags match `wrangler.toml`; Workers Logs is on; the rate-limit bindings the API calls exist.
- **Owed to `web`:** the `site-token` output, and a proxied custom domain.

## Deliberately the specialist's call

- How a construct's properties are grouped into its props interface, and construct ids within it.
- Whether a value is a constant in `config.ts` or a construct default.
- Which synth assertions to add beyond a story's acceptance criteria.
- The exact `TerraformAsset` and trigger wiring for the migration step.

## Never in this codebase

1. A secret value, token or account ID read from the environment or a file in TypeScript. Secrets are `TerraformVariable`s; credentials are Terraform's own environment variables.
2. A secret or token in any file in the repo, including test fixtures and the workflow.
3. A Cloudflare resource created, changed or deleted outside this project, except the state bucket, the Workers Paid subscription and budget alerts, which the dashboard owns.
4. A migration that renames or drops something the currently deployed code uses.
5. `wrangler deploy`, `wrangler publish` or any Wrangler command against production other than `d1 migrations apply`.
6. `cdktn deploy` without a `cdktn diff` reviewed first, or a plan in the workflow log.
7. A binding, `compatibility_date` or flag that differs from `api/wrangler.toml`.
8. Renaming a construct id on an existing resource without `moveTo`.
9. JavaScript logic on a Terraform token (comparing, concatenating, `.length`); `Fn` functions instead.
10. `addOverride` without a comment naming what the typed API lacks.
