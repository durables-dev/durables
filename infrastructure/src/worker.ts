import { AssetType, TerraformAsset, type TerraformVariable } from "cdktn";
import { Construct } from "constructs";
import { Worker as CloudflareWorker } from "../.gen/providers/cloudflare/worker";
import {
  WorkerVersion,
  type WorkerVersionBindings,
} from "../.gen/providers/cloudflare/worker-version";
import { WorkersDeployment } from "../.gen/providers/cloudflare/workers-deployment";
import { accountId, workerName } from "./config";
import type { Storage } from "./storage";
import type { WranglerConfig } from "./wrangler-config";

export interface WorkerProps {
  /** Values shared with api/wrangler.toml (ADR 0004). */
  readonly wrangler: WranglerConfig;
  readonly storage: Storage;
  /** The API bundle, api/dist/, built before synth (ADR 0003). */
  readonly apiBundleDir: string;
  /** The site's build, web/dist/, built before synth. */
  readonly siteDir: string;
  /** Secrets, as sensitive variables supplied at deploy. */
  readonly secrets: Readonly<Record<string, TerraformVariable>>;
  /** Non-secret OAuth client IDs, supplied at deploy. */
  readonly plainText: Readonly<Record<string, TerraformVariable>>;
}

// The one Worker: the API plus the site's static assets (ADR 0003, 0010). A version is
// immutable; each apply that changes anything creates a new version and deploys it at 100%.
export class Worker extends Construct {
  readonly worker: CloudflareWorker;
  readonly version: WorkerVersion;

  constructor(scope: Construct, id: string, props: WorkerProps) {
    super(scope, id);

    this.worker = new CloudflareWorker(this, "worker", {
      accountId,
      name: workerName,
      // api's logging rules rely on Workers Logs recording every request (api/CONVENTIONS.md).
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true },
      },
    });

    const bundle = new TerraformAsset(this, "api-bundle", {
      path: props.apiBundleDir,
      type: AssetType.DIRECTORY,
    });
    const site = new TerraformAsset(this, "site", {
      path: props.siteDir,
      type: AssetType.DIRECTORY,
    });

    this.version = new WorkerVersion(this, "version", {
      accountId,
      workerId: this.worker.id,
      compatibilityDate: props.wrangler.compatibilityDate,
      compatibilityFlags: [...props.wrangler.compatibilityFlags],
      mainModule: "index.js",
      modules: [
        {
          name: "index.js",
          contentType: "application/javascript+module",
          contentFile: `${bundle.path}/index.js`,
        },
        // Page headers (web/public/_headers) are uploaded as a module, as Cloudflare requires.
        {
          name: "_headers",
          contentType: "text/plain",
          contentFile: `${site.path}/_headers`,
        },
      ],
      assets: {
        directory: site.path,
        config: {
          notFoundHandling: "single-page-application",
        },
      },
      bindings: this.bindings(props),
    });
    // run_worker_first is typed as a map in the generated binding but the provider wants a
    // list of path rules; the override writes the list the typed API cannot express.
    this.version.addOverride("assets.config.run_worker_first", ["/api/*"]);

    new WorkersDeployment(this, "deployment", {
      accountId,
      scriptName: this.worker.name,
      strategy: "percentage",
      versions: [{ versionId: this.version.id, percentage: 100 }],
    });
  }

  private bindings(props: WorkerProps): WorkerVersionBindings[] {
    const { wrangler, storage } = props;
    return [
      { type: "d1", name: wrangler.d1Binding, id: storage.database.id },
      {
        type: "r2_bucket",
        name: wrangler.r2Binding,
        bucketName: storage.documents.name,
      },
      { type: "assets", name: wrangler.assetsBinding },
      ...wrangler.rateLimits.map(({ name, namespaceId, limit, period }) => ({
        type: "ratelimit",
        name,
        namespaceId,
        simple: { limit, period },
      })),
      ...Object.entries(props.plainText).map(([name, variable]) => ({
        type: "plain_text",
        name,
        text: variable.stringValue,
      })),
      ...Object.entries(props.secrets).map(([name, variable]) => ({
        type: "secret_text",
        name,
        text: variable.stringValue,
      })),
    ];
  }
}
