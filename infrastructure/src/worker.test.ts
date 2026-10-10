import { TerraformVariable, Testing } from "cdktn";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker as CloudflareWorker } from "../.gen/providers/cloudflare/worker";
import { WorkerVersion } from "../.gen/providers/cloudflare/worker-version";
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
writeFileSync(join(siteDir, "_headers"), "/*\n  X-Test: 1\n");

function synthWorker() {
  return Testing.synthScope((scope) => {
    const storage = new Storage(scope, "storage");
    const secret = new TerraformVariable(scope, "session_signing_key", {
      sensitive: true,
    });
    const plain = new TerraformVariable(scope, "github_client_id", {});
    new Worker(scope, "worker", {
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
