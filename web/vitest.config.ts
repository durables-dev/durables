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
          // Pre-bundle what the lazy routes and the test renderer import. Found mid-run, these
          // make Vite reload the test and load a second copy of React.
          optimizeDeps: {
            include: ["@tanstack/react-query", "react-dom/client"],
          },
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
