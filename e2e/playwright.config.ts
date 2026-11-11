import { defineConfig, devices } from "@playwright/test";

const ci = !!process.env["CI"];

// Flow tests against the local stack (docs/adr/0004): the Worker on 8787, the site on 5173.
// Flakiness controls follow Playwright's own configuration example (e2e/CONVENTIONS.md).
export default defineConfig({
  testDir: "tests",
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  ...(ci ? { workers: 1 } : {}),
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Local D1 starts empty, so its migrations are applied before the Worker starts. A
      // reused Worker needs `npm run db:migrate:local --workspace api` run once by hand.
      command:
        "npm run db:migrate:local --workspace api && npm run dev --workspace api",
      url: "http://localhost:8787/api/health",
      cwd: "..",
      reuseExistingServer: !ci,
    },
    {
      command: "npm run dev --workspace web",
      url: "http://localhost:5173",
      cwd: "..",
      reuseExistingServer: !ci,
    },
  ],
});
