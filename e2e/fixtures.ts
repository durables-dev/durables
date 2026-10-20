import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Every fixture lives here (e2e/CONVENTIONS.md). Tests import `test` and `expect` from this
// file, never from @playwright/test directly.

type StorageState = Exclude<BrowserContextOptions["storageState"], string>;

/** An identity to sign in as through the local fake provider (api: session/fake-sign-in.ts). */
export interface FakeIdentity {
  name: string;
  provider?: "github" | "gitlab" | "google" | "microsoft";
  username?: string;
  email?: string;
  /** Links the identity to a Durables account. Unique per call unless one is named. */
  providerAccountId?: string;
}

/** An account seeded straight into local D1, as publishing will create one. */
export interface SeededAccount {
  accountId: string;
  provider: "github";
  providerAccountId: string;
  handle: string;
}

interface Fixtures {
  /**
   * Asserts the current page has no WCAG 2.1 A/AA violations. Called on every page a test
   * lands on. It checks the test's page unless given another, such as a second tab.
   */
  expectAccessible: (target?: Page) => Promise<void>;
  /**
   * A handle no one holds, unique to this test. It derives from the worker index, with a
   * random part because the local stores persist between runs.
   */
  uniqueHandle: (label: string) => string;
  /**
   * Signs the page's browser context in as an identity through the local fake provider. A
   * real provider's callback does the same, then sends the browser to the Contribute flow.
   */
  signIn: (identity: FakeIdentity) => Promise<void>;
  /**
   * Creates an account with a handle, linked to one provider identity, the way publishing
   * will. The rows are removed when the test ends.
   */
  seedAccount: (
    seed?: Partial<Pick<SeededAccount, "providerAccountId" | "handle">>,
  ) => Promise<SeededAccount>;
}

interface WorkerFixtures {
  /** The browser state of this worker's signed-in publisher, who has no account yet. */
  workerSession: StorageState;
}

/** The name every signed-in test publisher carries, so the header shows "AL". */
export const publisherName = "Ada Lovelace";
export const publisherInitials = "AL";

const fakeSignInPath = "/api/session/providers/fake";

async function signInAs(
  request: APIRequestContext,
  identity: FakeIdentity,
): Promise<void> {
  const response = await request.post(fakeSignInPath, {
    data: {
      providerAccountId: `e2e-${randomUUID()}`,
      ...identity,
    },
    // The API accepts writes only from its own pages, which the browser marks this way.
    headers: { "Sec-Fetch-Site": "same-origin" },
  });
  expect(response.status(), await response.text()).toBe(204);
}

// Seeding writes to the same local D1 the running Worker reads (ADR 0004). There is no API
// that creates an account until publishing exists, so rows are written with Wrangler.
const apiDirectory = fileURLToPath(new URL("../api", import.meta.url));
const run = promisify(execFile);

async function executeSql(sql: string): Promise<void> {
  await run(
    "npx",
    ["wrangler", "d1", "execute", "durables", "--local", "--command", sql],
    { cwd: apiDirectory },
  );
}

/** Only generated values reach the SQL, and this guards that they stay plain. */
function sqlValue(value: string): string {
  if (!/^[a-z0-9-]+$/i.test(value)) {
    throw new Error(`Refusing to seed an unexpected value: ${value}`);
  }
  return `'${value}'`;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  expectAccessible: async ({ page }, use, testInfo) => {
    await use(async (target = page) => {
      const results = await new AxeBuilder({ page: target })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      await testInfo.attach("axe", {
        body: JSON.stringify(results.violations, null, 2),
        contentType: "application/json",
      });
      expect(results.violations).toEqual([]);
    });
  },

  // Sign-in is per worker: one unique identity, signed in once, its browser state reused by
  // every test in the worker. Tests that need an anonymous visitor opt out with an empty
  // storageState.
  workerSession: [
    async ({ browser }, use, workerInfo) => {
      const { baseURL } = workerInfo.project.use;
      const context = await browser.newContext({
        ...(baseURL === undefined ? {} : { baseURL }),
        storageState: { cookies: [], origins: [] },
      });
      await signInAs(context.request, {
        name: publisherName,
        username: `ada-w${workerInfo.workerIndex}`,
      });
      const state = await context.storageState();
      await context.close();
      await use(state);
    },
    { scope: "worker" },
  ],

  storageState: async ({ workerSession }, use) => {
    await use(workerSession);
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern; this one needs none.
  uniqueHandle: async ({}, use, testInfo) => {
    await use(
      (label) =>
        `e2e-w${testInfo.workerIndex}-${label}-${randomUUID().slice(0, 8)}`,
    );
  },

  signIn: async ({ page }, use) => {
    await use((identity) => signInAs(page.request, identity));
  },

  seedAccount: async ({ uniqueHandle }, use) => {
    const seeded: SeededAccount[] = [];
    await use(async (seed = {}) => {
      const unique = randomUUID();
      const account: SeededAccount = {
        accountId: `e2e-${unique}`,
        provider: "github",
        providerAccountId: seed.providerAccountId ?? `e2e-${unique}`,
        handle: seed.handle ?? uniqueHandle("seed"),
      };
      const id = sqlValue(account.accountId);
      await executeSql(
        [
          `INSERT INTO accounts (id) VALUES (${id});`,
          `INSERT INTO provider_accounts (provider, provider_account_id, account_id) VALUES ('github', ${sqlValue(account.providerAccountId)}, ${id});`,
          `INSERT INTO handles (handle, account_id) VALUES (${sqlValue(account.handle)}, ${id});`,
        ].join(" "),
      );
      seeded.push(account);
      return account;
    });
    for (const { accountId } of seeded) {
      const id = sqlValue(accountId);
      await executeSql(
        [
          `DELETE FROM handles WHERE account_id = ${id};`,
          `DELETE FROM provider_accounts WHERE account_id = ${id};`,
          `DELETE FROM accounts WHERE id = ${id};`,
        ].join(" "),
      );
    }
  },
});

export { expect };
