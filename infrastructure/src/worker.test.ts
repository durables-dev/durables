import { TerraformVariable, Testing } from "cdktn";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker as CloudflareWorker } from "../.gen/providers/cloudflare/worker";
import { WorkerVersion } from "../.gen/providers/cloudflare/worker-version";
import { WorkersCronTrigger } from "../.gen/providers/cloudflare/workers-cron-trigger";
import { WorkersDeployment } from "../.gen/providers/cloudflare/workers-deployment";
import { Storage } from "./storage";
import { Worker } from "./worker";
import { readWranglerConfig } from "./wrangler-config";

const wrangler = readWranglerConfig(
  fileURLToPath(new URL("../../api/wrangler.toml", import.meta.url)),
);

// Stand-ins for the build outputs, so the test needs no prior build.
const apiBundleDir = join(tmpdir(), "durables-test-api-dist");
const siteDir = join(tmpdir(), "durables-test-web-dist");
mkdirSync(apiBundleDir, { recursive: true });
mkdirSync(siteDir, { recursive: true });
writeFileSync(join(apiBundleDir, "index.js"), "export default {};");
writeFileSync(join(apiBundleDir, "abc123-install.txt"), "npm install");
writeFileSync(join(siteDir, "_headers"), "/*\n  X-Test: 1\n");

function synthWorker() {
  return Testing.synthScope((scope) => {
    const storage = new Storage(scope, "storage", { accountId: "account-id" });
    const secret = new TerraformVariable(scope, "session_signing_key", {
      sensitive: true,
    });
    const plain = new TerraformVariable(scope, "github_client_id", {});
    new Worker(scope, "worker", {
      accountId: "account-id",
      wrangler,
      storage,
      apiBundleDir,
      siteDir,
      secrets: { SESSION_SIGNING_KEY: secret },
      plainText: { GITHUB_CLIENT_ID: plain },
    });
  });
}

test("creates the worker with Workers Logs on, a version, and a 100% deployment", () => {
  const synthesized = synthWorker();

  expect(synthesized).toHaveResourceWithProperties(CloudflareWorker, {
    observability: {
      enabled: true,
      logs: { enabled: true, invocation_logs: true },
    },
  });
  expect(synthesized).toHaveResource(WorkerVersion);
  expect(synthesized).toHaveResourceWithProperties(WorkersDeployment, {
    strategy: "percentage",
  });
});

test("the version carries wrangler.toml's compatibility date and bindings (ADR 0004)", () => {
  const synthesized = synthWorker();
  const stack = JSON.parse(synthesized) as {
    resource: {
      cloudflare_worker_version: Record<
        string,
        {
          compatibility_date: string;
          bindings: { type: string; name: string }[];
        }
      >;
    };
  };
  const [config] = Object.values(stack.resource.cloudflare_worker_version);
  if (!config) throw new Error("no worker version synthesized");

  expect(config.compatibility_date).toBe(wrangler.compatibilityDate);
  const names = config.bindings.map((binding) => binding.name);
  expect(names).toEqual(
    expect.arrayContaining([
      wrangler.d1Binding,
      wrangler.r2Binding,
      wrangler.assetsBinding,
      ...wrangler.rateLimits.map((limit) => limit.name),
      "SESSION_SIGNING_KEY",
      "GITHUB_CLIENT_ID",
    ]),
  );
});

test("the Worker answers the API and the sitemap before the site's assets", () => {
  const stack = JSON.parse(synthWorker()) as {
    resource: {
      cloudflare_worker_version: Record<
        string,
        { assets: { config: { run_worker_first: string[] } } }
      >;
    };
  };
  const [config] = Object.values(stack.resource.cloudflare_worker_version);
  if (!config) throw new Error("no worker version synthesized");

  expect(config.assets.config.run_worker_first).toEqual([
    "/api/*",
    "/sitemap.xml",
  ]);
});

test("uploads the bundle's text modules beside index.js", () => {
  const stack = JSON.parse(synthWorker()) as {
    resource: {
      cloudflare_worker_version: Record<
        string,
        { modules: { name: string; content_type: string }[] }
      >;
    };
  };
  const [config] = Object.values(stack.resource.cloudflare_worker_version);
  if (!config) throw new Error("no worker version synthesized");

  expect(config.modules).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "abc123-install.txt",
        content_type: "text/plain",
      }),
    ]),
  );
});

test("declares one daily trigger, read from wrangler.toml, for the final-deletion job (ADR 0015)", () => {
  const synthesized = synthWorker();
  const stack = JSON.parse(synthesized) as {
    resource: {
      cloudflare_workers_cron_trigger?: Record<
        string,
        {
          account_id: string;
          script_name: string;
          schedules: { cron: string }[];
          depends_on: string[];
        }
      >;
    };
  };
  const triggers = Object.values(
    stack.resource.cloudflare_workers_cron_trigger ?? {},
  );

  expect(triggers).toHaveLength(1);
  const [trigger] = triggers;
  if (!trigger) throw new Error("no cron trigger synthesized");
  expect(trigger.account_id).toBe("account-id");
  expect(trigger.script_name).toMatch(/^\$\{cloudflare_worker\.[^.]+\.name\}$/);
  expect(trigger.schedules).toEqual(wrangler.crons.map((cron) => ({ cron })));
  expect(trigger.depends_on).toEqual([
    expect.stringMatching(/^cloudflare_workers_deployment\./),
  ]);

  // Daily: one fixed minute and hour, on every day of every month.
  expect(trigger.schedules).toHaveLength(1);
  const fields = trigger.schedules[0]?.cron.split(" ");
  expect(fields).toEqual([
    expect.stringMatching(/^\d+$/),
    expect.stringMatching(/^\d+$/),
    "*",
    "*",
    "*",
  ]);
  expect(synthesized).toHaveResource(WorkersCronTrigger);
});
