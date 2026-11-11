// Non-secret values that identify and size the deployment. Secrets, and the Cloudflare
// account and zone IDs, are TerraformVariables (see main.ts); nothing here is read from the
// environment. Anything the Worker shares with local development (bindings, compatibility
// settings, rate limits) comes from api/wrangler.toml instead, through wrangler-config.ts.

export const hostname = "durables.dev";
export const workerName = "durables";
export const databaseName = "durables";
export const documentsBucketName = "durables-documents";

/** Created by hand before the first deploy; it cannot be managed by the state it holds. */
export const stateBucketName = "durables-terraform-state";
