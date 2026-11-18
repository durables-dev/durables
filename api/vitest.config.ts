import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The D1 migrations, applied to the local database before each integration test file
// (src/storage/apply-migrations.setup.ts).
const d1Migrations = await readD1Migrations("./migrations");

// Two levels (api/CONVENTIONS.md): unit tests run in Node, integration tests run in the
// Workers runtime with local D1 and R2, against the Worker wrangler.toml defines.
export default defineConfig({
  test: {
    // Until the first unit test exists, an empty unit project is not a failure.
    passWithNoTests: true,
    projects: [
      {
        // The snippet templates (src/snippets/templates/) and the SDK logos (src/sdks/logos/)
        // are text modules. Wrangler bundles .txt and .svg imports as text (wrangler.toml);
        // here each one is imported as Vite's raw text instead.
        plugins: [
          {
            name: "text-modules",
            enforce: "pre",
            resolveId(source, importer) {
              return source.endsWith(".txt") || source.endsWith(".svg")
                ? this.resolve(`${source}?raw`, importer, { skipSelf: true })
                : undefined;
            },
          },
        ],
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        plugins: [
          cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } }),
        ],
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          provide: { d1Migrations },
          setupFiles: ["./src/storage/apply-migrations.setup.ts"],
        },
      },
    ],
  },
});
