import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Two levels (web/CONVENTIONS.md): unit tests run in Node, component tests run in real
// Chromium through Vitest's browser mode, with the API mocked by MSW.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      passWithNoTests: true,
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            include: ["src/**/*.test.ts"],
            environment: "node",
          },
        },
        {
          extends: true,
          // MSW's worker script is served from here in tests only, never from public/.
          publicDir: "test/public",
          test: {
            name: "component",
            include: ["src/**/*.test.tsx"],
            setupFiles: ["./test/setup.ts"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: "chromium" }],
            },
          },
        },
      ],
    },
  }),
);
