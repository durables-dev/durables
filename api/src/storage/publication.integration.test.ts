import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import {
  readAllRows,
  seedAccount,
  seedListing,
  seedRetiredHandle,
} from "./seed";
import {
  Storage,
  type Address,
  type NewListing,
  type ProviderIdentity,
  type Sdk,
  type VersionDocument,
} from "./storage";

// Recording a publication in real local D1, and deleting a version document in real local R2.

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** A provider identity no other test uses. */
const newIdentity = (): ProviderIdentity => ({
  provider: "github",
  providerAccountId: `publisher-${crypto.randomUUID()}`,
});

/** A handle no other test uses. */
const newHandle = () => `pub-${crypto.randomUUID().slice(0, 8)}`;

const newListing = (
  handle: string,
  listing: Partial<NewListing> = {},
): NewListing => ({
  handle,
  name: `activity-${crypto.randomUUID().slice(0, 8)}`,
  version: "1.0.0",
  title: "Post slack message",
  description: "Posts a message to a Slack channel.",
  sdk: "Python",
  integrations: ["Slack"],
  ...listing,
});

/** The rows a table gained between two reads, compared by content. */
const added = (
  before: Record<string, unknown[]>,
  after: Record<string, unknown[]>,
  table: string,
) =>
  (after[table] ?? []).filter(
    (row) =>
      !(before[table] ?? []).some(
        (b) => JSON.stringify(b) === JSON.stringify(row),
      ),
  );

const tables = [
  "accounts",
  "providerAccounts",
  "handles",
  "retiredHandles",
  "listings",
  "versions",
];

describe("recording a publication", () => {
  test("creates the account, provider link, handle, listing and version together", async () => {
    const identity = newIdentity();
    const listing = newListing(newHandle());
    const before = await readAllRows(env.DB);

    const result = await storage().createPublication({
      listing,
      newAccount: identity,
    });

    expect(result).toEqual({
      outcome: "created",
      listing: await storage().findListing(listing),
      accountCreated: true,
    });
    const account = await storage().findAccountByProviderIdentity(identity);
    expect(account).toEqual({
      id: expect.any(String) as string,
      handle: listing.handle,
    });
    const after = await readAllRows(env.DB);
    expect(added(before, after, "accounts")).toHaveLength(1);
    expect(added(before, after, "providerAccounts")).toHaveLength(1);
    expect(added(before, after, "handles")).toHaveLength(1);
    expect(added(before, after, "listings")).toHaveLength(1);
    expect(added(before, after, "versions")).toHaveLength(1);
  });

  test("writes only the listing and version when the account exists", async () => {
    const seeded = await seedAccount(env.DB);
    const listing = newListing(seeded.handle);
    const before = await readAllRows(env.DB);

    const result = await storage().createPublication({ listing });

    expect(result).toMatchObject({ outcome: "created", accountCreated: false });
    const after = await readAllRows(env.DB);
    for (const table of ["accounts", "providerAccounts", "handles"]) {
      expect(added(before, after, table)).toEqual([]);
    }
    expect(added(before, after, "versions")).toHaveLength(1);
  });

  test("writes nothing and reports handle-taken when another account holds the handle", async () => {
    const other = await seedAccount(env.DB);
    const before = await readAllRows(env.DB);

    const result = await storage().createPublication({
      listing: newListing(other.handle),
      newAccount: newIdentity(),
    });

    expect(result).toEqual({ outcome: "handle-taken" });
    const after = await readAllRows(env.DB);
    for (const table of tables) {
      expect(added(before, after, table)).toEqual([]);
    }
  });

  test("writes nothing and reports handle-taken for a retired handle", async () => {
    const handle = newHandle();
    await seedRetiredHandle(env.DB, handle);
    const identity = newIdentity();
    const before = await readAllRows(env.DB);

    const result = await storage().createPublication({
      listing: newListing(handle),
      newAccount: identity,
    });

    expect(result).toEqual({ outcome: "handle-taken" });
    expect(
      await storage().findAccountByProviderIdentity(identity),
    ).toBeUndefined();
    const after = await readAllRows(env.DB);
    for (const table of tables) {
      expect(added(before, after, table)).toEqual([]);
    }
  });

  test("writes no account when the version's row fails, so the batch is all or nothing", async () => {
    // The version's SDK check refuses this value. Its insert is the batch's last statement.
    const identity = newIdentity();
    const listing = newListing(newHandle(), { sdk: "Kotlin" as Sdk });
    const before = await readAllRows(env.DB);

    await expect(
      storage().createPublication({ listing, newAccount: identity }),
    ).rejects.toThrow();

    expect(await readAllRows(env.DB)).toEqual(before);
    expect(
      await storage().findAccountByProviderIdentity(identity),
    ).toBeUndefined();
  });

  test("reports address-taken and writes nothing when a listing row exists with no version", async () => {
    // Publishing never leaves a listing with no version. It makes the listing insert fail.
    const seeded = await seedAccount(env.DB);
    const listing = newListing(seeded.handle);
    await seedListing(env.DB, {
      handle: seeded.handle,
      name: listing.name,
      description: "Left behind",
    });
    const before = await readAllRows(env.DB);

    const result = await storage().createPublication({ listing });

    expect(result).toEqual({ outcome: "address-taken" });
    expect(await readAllRows(env.DB)).toEqual(before);
  });

  test("publishes under the account another publish just created when it holds the same handle", async () => {
    const identity = newIdentity();
    const handle = newHandle();
    // The account was created after the caller looked, so the caller still asks to create it.
    await storage().createAccount({ ...identity, handle });
    const listing = newListing(handle);

    const result = await storage().createPublication({
      listing,
      newAccount: identity,
    });

    expect(result).toMatchObject({ outcome: "created", accountCreated: false });
    expect(await storage().findListing(listing)).toBeDefined();
  });

  test("reports handle-taken when the identity's account holds a different handle", async () => {
    const identity = newIdentity();
    await storage().createAccount({ ...identity, handle: newHandle() });
    const listing = newListing(newHandle());

    const result = await storage().createPublication({
      listing,
      newAccount: identity,
    });

    expect(result).toEqual({ outcome: "handle-taken" });
    expect(await storage().findListing(listing)).toBeUndefined();
  });

  test("reports address-taken for a published address and keeps the first version", async () => {
    const seeded = await seedAccount(env.DB);
    const listing = newListing(seeded.handle);
    await storage().createPublication({ listing });
    const first = await storage().findListing(listing);

    const result = await storage().createPublication({
      listing: { ...listing, title: "Another title", sdk: ".NET" },
    });

    expect(result).toEqual({ outcome: "address-taken" });
    expect(await storage().findListing(listing)).toEqual(first);
  });
});

describe("deleting a version document", () => {
  const address = (): Address => ({
    handle: newHandle(),
    name: `activity-${crypto.randomUUID().slice(0, 8)}`,
    version: "1.0.0",
  });

  const document: VersionDocument = {
    code: "from temporalio import activity\n",
    facts: {
      sdk: "Python",
      activity: { name: "post", line: 3 },
      input: null,
      output: null,
      runsAs: "async",
      nonRetryableErrors: [],
      configurationRead: [],
      dependencies: [],
      heartbeats: [],
    },
    integrations: [],
    snippets: [],
    title: "Post",
    description: "Posts.",
  };

  test("removes the document, so the address can be written again", async () => {
    const at = address();
    await storage().writeVersionDocument(at, document);

    await storage().deleteVersionDocument(at);

    expect(await storage().readVersionDocument(at)).toBeUndefined();
    expect(await storage().writeVersionDocument(at, document)).toEqual({
      outcome: "created",
    });
  });

  test("does nothing for an address with no document", async () => {
    await expect(
      storage().deleteVersionDocument(address()),
    ).resolves.toBeUndefined();
  });
});
