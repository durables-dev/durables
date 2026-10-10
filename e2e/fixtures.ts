import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "@playwright/test";

// Every fixture lives here (e2e/CONVENTIONS.md). Tests import `test` and `expect` from this
// file, never from @playwright/test directly.

interface Fixtures {
  /** Asserts the current page has no WCAG 2.1 A/AA violations. Called on every page a test lands on. */
  expectAccessible: () => Promise<void>;
}

export const test = base.extend<Fixtures>({
  expectAccessible: async ({ page }, use, testInfo) => {
    await use(async () => {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      await testInfo.attach("axe", {
        body: JSON.stringify(results.violations, null, 2),
        contentType: "application/json",
      });
      expect(results.violations).toEqual([]);
    });
  },
});

export { expect };
