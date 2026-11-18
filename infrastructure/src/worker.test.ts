import { TerraformVariable, Testing } from "cdktn";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

// A bundle carrying the SDK logos, which api/wrangler.toml bundles as Text modules, beside a
// text snippet and files Wrangler emits that are not modules (a source map, a README).
const logoBundleDir = mkdtempSync(
  join(tmpdir(), "durables-test-api-dist-logos-"),
);
writeFileSync(join(logoBundleDir, "index.js"), "export default {};");
writeFileSync(join(logoBundleDir, "abc123-install.txt"), "npm install");
writeFileSync(join(logoBundleDir, "f00d42-rust.svg"), "<svg/>");
writeFileSync(join(logoBundleDir, "0bad1e-go.svg"), "<svg/>");
writeFileSync(join(logoBundleDir, "index.js.map"), "{}");
writeFileSync(join(logoBundleDir, "README.md"), "# Bundle");

interface Module {
  name: string;
  contentType: string;
  /** The directory content_file reads from, so a module's place beside index.js is checked. */
  directory: string;
  file: string;
}

function synthModules(bundleDir: string): Module[] {
  const stack = JSON.parse(synthWorker(bundleDir)) as {
    resource: {
      cloudflare_worker_version: Record<
        string,
        {
          modules: {
            name: string;
            content_type: string;
            content_file: string;
          }[];
        }
      >;
    };
  };
  const [config] = Object.values(stack.resource.cloudflare_worker_version);
  if (!config) throw new Error("no worker version synthesized");
  return config.modules.map((module) => {
    const slash = module.content_file.lastIndexOf("/");
    return {
      name: module.name,
      contentType: module.content_type,
      directory: module.content_file.slice(0, slash),
      file: module.content_file.slice(slash + 1),
    };
  });
}

function bundleDirectory(modules: Module[]): string {
  const main = modules.find((module) => module.name === "index.js");
  if (!main) throw new Error("no index.js module synthesized");
  return main.directory;
}

function synthWorker(bundleDir = apiBundleDir) {
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
      apiBundleDir: bundleDir,
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

test("uploads the bundle's SVG modules beside index.js", () => {
  const modules = synthModules(logoBundleDir);
  const directory = bundleDirectory(modules);

  expect(modules).toContainEqual({
    name: "0bad1e-go.svg",
    contentType: "text/plain",
    directory,
    file: "0bad1e-go.svg",
  });
  expect(modules).toContainEqual({
    name: "f00d42-rust.svg",
    contentType: "text/plain",
    directory,
    file: "f00d42-rust.svg",
  });
});

test("uploads one module per text or SVG file, sorted by name, and no other file", () => {
  const modules = synthModules(logoBundleDir);

  expect(modules.map((module) => module.name)).toEqual([
    "index.js",
    "0bad1e-go.svg",
    "abc123-install.txt",
    "f00d42-rust.svg",
    "_headers",
  ]);
});

test("still uploads the bundle's text modules unchanged beside SVG modules", () => {
  const modules = synthModules(logoBundleDir);

  expect(modules).toContainEqual({
    name: "abc123-install.txt",
    contentType: "text/plain",
    directory: bundleDirectory(modules),
    file: "abc123-install.txt",
  });
});

test("does not upload a bundle file that is neither text nor SVG", () => {
  const names = synthModules(logoBundleDir).map((module) => module.name);

  expect(names).not.toContain("index.js.map");
  expect(names).not.toContain("README.md");
});

test("a bundle without SVG files gives the same modules as before", () => {
  const modules = synthModules(apiBundleDir);
  const directory = bundleDirectory(modules);

  expect(
    modules.map(({ name, contentType, file }) => ({ name, contentType, file })),
  ).toEqual([
    {
      name: "index.js",
      contentType: "application/javascript+module",
      file: "index.js",
    },
    {
      name: "abc123-install.txt",
      contentType: "text/plain",
      file: "abc123-install.txt",
    },
    { name: "_headers", contentType: "text/plain", file: "_headers" },
  ]);
  expect(modules[1]?.directory).toBe(directory);
  expect(modules[2]?.directory).not.toBe(directory);
});
