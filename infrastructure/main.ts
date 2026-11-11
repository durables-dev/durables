import { App, S3Backend, TerraformStack, TerraformVariable } from "cdktn";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";
import { CloudflareProvider } from "./.gen/providers/cloudflare/provider";
import { Analytics } from "./src/analytics";
import { stateBucketName, workerName } from "./src/config";
import { Domain } from "./src/domain";
import { Migrations } from "./src/migrations";
import { Storage } from "./src/storage";
import { Worker } from "./src/worker";
import { readWranglerConfig } from "./src/wrangler-config";

const repo = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

// The single definition of everything Durables deploys (ADR 0003). One stack, production
// only. Build web and api at the root first; their outputs are inputs here.
class DurablesStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // State in R2 (ADR 0003). Credentials, the encryption key and the R2 endpoint
    // (AWS_ENDPOINT_URL_S3, which names the account) come from Terraform's own environment
    // variables; see README. A backend cannot read Terraform variables.
    new S3Backend(this, {
      bucket: stateBucketName,
      key: "durables.tfstate",
      region: "auto",
      useLockfile: true,
      usePathStyle: true,
      skipCredentialsValidation: true,
      skipRegionValidation: true,
      skipRequestingAccountId: true,
      skipMetadataApiCheck: true,
      skipS3Checksum: true,
    });

    // Authenticates from CLOUDFLARE_API_TOKEN.
    new CloudflareProvider(this, "cloudflare", {});

    const secret = (name: string) =>
      new TerraformVariable(this, name, { type: "string", sensitive: true });
    const plain = (name: string) =>
      new TerraformVariable(this, name, { type: "string" });

    // The Cloudflare account and the durables.dev zone. Not secret, but kept out of the repo.
    const accountId = plain("cloudflare_account_id").stringValue;
    const zoneId = plain("cloudflare_zone_id").stringValue;

    const storage = new Storage(this, "storage", { accountId });

    const migrations = new Migrations(this, "migrations", {
      accountId,
      migrationsDir: repo("api/migrations"),
      databaseId: storage.database.id,
      dependsOn: [storage.database],
    });

    const worker = new Worker(this, "worker", {
      accountId,
      wrangler: readWranglerConfig(repo("api/wrangler.toml")),
      storage,
      apiBundleDir: repo("api/dist"),
      siteDir: repo("web/dist"),
      plainText: {
        GITHUB_CLIENT_ID: plain("github_client_id"),
        GITLAB_CLIENT_ID: plain("gitlab_client_id"),
        GOOGLE_CLIENT_ID: plain("google_client_id"),
        MICROSOFT_CLIENT_ID: plain("microsoft_client_id"),
      },
      secrets: {
        GITHUB_CLIENT_SECRET: secret("github_client_secret"),
        GITLAB_CLIENT_SECRET: secret("gitlab_client_secret"),
        GOOGLE_CLIENT_SECRET: secret("google_client_secret"),
        MICROSOFT_CLIENT_SECRET: secret("microsoft_client_secret"),
        SESSION_SIGNING_KEY: secret("session_signing_key"),
      },
    });
    worker.version.node.addDependency(migrations.resource);

    new Domain(this, "domain", {
      accountId,
      zoneId,
      workerName,
      // Cloudflare refuses a custom domain for a Worker with no deployment.
      dependsOn: [worker.deployment],
    });
    new Analytics(this, "analytics", { accountId, zoneId });
  }
}

const app = new App();
new DurablesStack(app, "durables");
app.synth();
