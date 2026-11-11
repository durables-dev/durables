import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** What a publish through the API sends besides the six confirmations, which are all true. */
export interface PublishDetails {
  code: string;
  title: string;
  name: string;
  description: string;
}

/** What the API answers a publish with (api: activities/responses.ts). */
export interface PublishResponse {
  handle: string;
  name: string;
  version: string;
  accountCreated: boolean;
}

/** A version published by a publisher of its own, as `publishListing` returns it. */
export interface PublishedListing extends PublishResponse {
  /** The address the listing opens at: `handle/name@version`. */
  address: string;
}

/** A listing published by the test page's own signed-in publisher, as `publishOwnListing` returns it. */
export interface OwnListing extends PublishedListing {
  /** The identity the publisher signed in with, to sign in as them again. */
  identity: FakeIdentity & { providerAccountId: string };
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
  /**
   * Seeds an account and signs the page's browser context in as its owner. The publisher has
   * their own identity, and with it their own check rate limit, and the Contribute flow opens
   * on the Code step.
   */
  signInWithAccount: () => Promise<SeededAccount>;
  /**
   * Pastes text into a field through the clipboard, replacing what it holds, as a publisher's
   * paste does. The page sees a paste, not typing.
   */
  paste: (field: Locator, text: string) => Promise<void>;
  /**
   * Publishes an activity through the API as the page's signed-in publisher, with all six
   * confirmations given, the way the Review step does. The publisher needs a chosen handle.
   * It counts towards their publish rate limit.
   */
  publishThroughApi: (details: PublishDetails) => Promise<PublishResponse>;
  /**
   * Publishes an activity through the API as a new publisher of its own, signed in on a
   * separate API context with a unique handle. The test's page stays as it was, so it can
   * visit the listing as anyone, including an anonymous visitor.
   */
  publishListing: (details: PublishDetails) => Promise<PublishedListing>;
  /**
   * Signs the page's browser context in as a new publisher with a unique handle, chooses that
   * handle and publishes an activity through the API, the way the Contribute flow does. The
   * page then visits as the listing's publisher, with an account. It counts towards their
   * publish rate limit.
   */
  publishOwnListing: (details: PublishDetails) => Promise<OwnListing>;
  /**
   * Adds another version under a published listing, the way a later publish will. Publishing
   * creates only a listing's first version, so the version's row is written to local D1 and its
   * document is a copy of the first version's in local R2, pointing at its own address. It
   * returns the version's address: `handle/name@version`.
   */
  seedVersion: (listing: PublishedListing, version: string) => Promise<string>;
  /**
   * Publishes several activities through the API, in the order given, as one new publisher of
   * its own, the way publishListing publishes one. At most ten, the publish rate limit.
   */
  publishListings: (
    details: readonly PublishDetails[],
  ) => Promise<PublishedListing[]>;
  /**
   * A word no published activity holds, unique to this test. Put in a title or description, it
   * lets a search match this test's activities and nothing else. It derives from the worker
   * index, with a random part because the local stores persist between runs.
   */
  uniqueWord: () => string;
  /**
   * Reads the clipboard, as a paste would. Clipboard access is granted for the test, so the
   * page's own Copy buttons can write to it.
   */
  readClipboard: () => Promise<string>;
}

interface WorkerFixtures {
  /** The browser state of this worker's signed-in publisher, who has no account yet. */
  workerSession: StorageState;
}

/** The name every signed-in test publisher carries, so the header shows "AL". */
export const publisherName = "Ada Lovelace";
export const publisherInitials = "AL";

/** A file from samples/, exactly as written. */
export function sample(name: string): string {
  return readFileSync(new URL(`samples/${name}.txt`, import.meta.url), "utf8");
}

const fakeSignInPath = "/api/session/providers/fake";
const chosenHandlePath = "/api/session/handle";
const publishPath = "/api/activities";

// The API accepts writes only from its own pages, which the browser marks this way.
const sameOrigin = { "Sec-Fetch-Site": "same-origin" };

/** The six confirmations a publish carries (packages/schemas: publishConfirmationKeys). */
const allConfirmations = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
};

async function signInAs(
  request: APIRequestContext,
  identity: FakeIdentity,
): Promise<void> {
  const response = await request.post(fakeSignInPath, {
    data: {
      providerAccountId: `e2e-${randomUUID()}`,
      ...identity,
    },
    headers: sameOrigin,
  });
  expect(response.status(), await response.text()).toBe(204);
}

async function publishAs(
  request: APIRequestContext,
  details: PublishDetails,
): Promise<PublishResponse> {
  const response = await request.post(publishPath, {
    data: { ...details, confirmations: allConfirmations },
    headers: sameOrigin,
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as PublishResponse;
}

// Seeding writes to the same local D1 and R2 the running Worker reads (ADR 0004). There is no
// API that creates an account until publishing exists, and none that publishes a later version,
// so rows and documents are written with Wrangler.
const apiDirectory = fileURLToPath(new URL("../api", import.meta.url));
const run = promisify(execFile);

async function executeSql(sql: string): Promise<void> {
  await run(
    "npx",
    ["wrangler", "d1", "execute", "durables", "--local", "--command", sql],
    { cwd: apiDirectory },
  );
}

/** The bucket that holds version documents (api: wrangler.toml, DOCUMENTS). */
const documentsBucket = "durables-documents";

/** Where a version's document is kept (api: storage/version-document, versionDocumentKey). */
function versionDocumentPath(handle: string, name: string, version: string) {
  return `${documentsBucket}/versions/${encodeURIComponent(handle)}/${encodeURIComponent(name)}@${encodeURIComponent(version)}.json`;
}

async function r2Object(
  command: "get" | "put",
  objectPath: string,
  file: string,
  ...options: string[]
): Promise<void> {
  await run(
    "npx",
    [
      "wrangler",
      "r2",
      "object",
      command,
      objectPath,
      "--local",
      "--file",
      file,
      ...options,
    ],
    { cwd: apiDirectory },
  );
}

/** Only generated values reach the SQL, and this guards that they stay plain. */
function sqlValue(value: string): string {
  if (!/^[a-z0-9.-]+$/i.test(value)) {
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

  signInWithAccount: async ({ seedAccount, signIn }, use) => {
    await use(async () => {
      const account = await seedAccount();
      await signIn({
        name: publisherName,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      });
      return account;
    });
  },

  paste: async ({ context, page }, use) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await use(async (field, text) => {
      await page.evaluate(
        async (copied) => navigator.clipboard.writeText(copied),
        text,
      );
      await field.focus();
      await field.press("ControlOrMeta+A");
      await field.press("ControlOrMeta+V");
    });
  },

  publishThroughApi: async ({ page }, use) => {
    await use((details) => publishAs(page.request, details));
  },

  // The publisher signs in and chooses a handle the way the Contribute flow does, then
  // publishes. Nothing is cleaned up: the version's rows hold the account's handle.
  publishListing: async ({ publishListings }, use) => {
    await use(async (details) => {
      const [published] = await publishListings([details]);
      if (published === undefined) throw new Error("Nothing was published.");
      return published;
    });
  },

  // The publisher signs in on the page's own context, so the page visits as them.
  publishOwnListing: async ({ page, uniqueHandle }, use) => {
    await use(async (details) => {
      const handle = uniqueHandle("own");
      const identity = {
        name: publisherName,
        username: handle,
        providerAccountId: `e2e-${randomUUID()}`,
      };
      await signInAs(page.request, identity);
      const chosen = await page.request.put(chosenHandlePath, {
        data: { handle },
        headers: sameOrigin,
      });
      expect(chosen.status(), await chosen.text()).toBe(200);
      const response = await publishAs(page.request, details);
      return {
        ...response,
        address: `${response.handle}/${response.name}@${response.version}`,
        identity,
      };
    });
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern; this one needs none.
  seedVersion: async ({}, use) => {
    await use(async ({ handle, name, version: first, address }, version) => {
      const later = `${handle}/${name}@${version}`;
      const directory = await mkdtemp(join(tmpdir(), "durables-e2e-"));
      try {
        const file = join(directory, "document.json");
        await r2Object("get", versionDocumentPath(handle, name, first), file);
        const document = await readFile(file, "utf8");
        await writeFile(file, document.replaceAll(address, later));
        await r2Object(
          "put",
          versionDocumentPath(handle, name, version),
          file,
          "--content-type",
          "application/json",
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
      // The document is written before the row, as publishing does, so the row never points at
      // a missing document.
      await executeSql(
        `INSERT INTO versions (handle, name, version, title, sdk, integrations) SELECT handle, name, ${sqlValue(version)}, title, sdk, integrations FROM versions WHERE handle = ${sqlValue(handle)} AND name = ${sqlValue(name)} AND version = ${sqlValue(first)};`,
      );
      return later;
    });
  },

  publishListings: async ({ playwright, baseURL, uniqueHandle }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (listings) => {
      if (listings.length > 10) {
        throw new Error("One publisher can publish at most ten a minute.");
      }
      const request = await playwright.request.newContext(
        baseURL === undefined ? {} : { baseURL },
      );
      contexts.push(request);
      const handle = uniqueHandle("pub");
      await signInAs(request, { name: publisherName, username: handle });
      const chosen = await request.put(chosenHandlePath, {
        data: { handle },
        headers: sameOrigin,
      });
      expect(chosen.status(), await chosen.text()).toBe(200);
      const published: PublishedListing[] = [];
      for (const details of listings) {
        const response = await publishAs(request, details);
        published.push({
          ...response,
          address: `${response.handle}/${response.name}@${response.version}`,
        });
      }
      return published;
    });
    for (const request of contexts) {
      await request.dispose();
    }
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern; this one needs none.
  uniqueWord: async ({}, use, testInfo) => {
    await use(
      () =>
        `zq${testInfo.workerIndex}x${randomUUID().replaceAll("-", "").slice(0, 10)}`,
    );
  },

  readClipboard: async ({ context, page }, use) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await use(() => page.evaluate(() => navigator.clipboard.readText()));
  },
});

export { expect };
