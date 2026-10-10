import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Two levels (api/CONVENTIONS.md): unit tests run in Node, integration tests run in the
// Workers runtime with local D1 and R2, against the Worker wrangler.toml defines.
export default defineConfig({
  test: {
    // Until the first unit test exists, an empty unit project is not a failure.
    passWithNoTests: true,
    projects: [
      {
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
        },
      },
    ],
  },
});
