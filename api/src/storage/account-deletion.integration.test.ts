import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, test } from "vitest";
import { accounts, listings, providerAccounts, retiredHandles } from "./schema";
import {
  readAllRows,
  seedAccount,
  seedDeletionRequest,
  seedListing,
  seedProviderLink,
  seedRemoval,
  seedVersion,
  type SeededAccount,
} from "./seed";
import { Storage } from "./storage";

// Deleting an account, restoring it, and making the deletion final (ADR 0015), against real
// local D1. Each test seeds its own account, so handles never collide.

const storage = () => new Storage(env.DB, env.DOCUMENTS);
const db = () => drizzle(env.DB);

/** Adds a listing with one version under a handle, and returns its name. */
const addListing = async (handle: string, name: string): Promise<string> => {
  await seedListing(env.DB, { handle, name });
  await seedVersion(env.DB, {
    handle,
    name,
    version: "1.0.0",
    title: "Charge card",
    sdk: "Python",
    integrations: [],
    description: "Charges a card.",
  });
  return name;
};

/**
 * An account with three listings: two listed, and one its publisher already removed. Another
 * account's listing sits beside them, to show deletion never reaches it.
 */
const accountWithListings = async () => {
  const account = await seedAccount(env.DB);
  await addListing(account.handle, "charge-card");
  await addListing(account.handle, "refund-card");
  await addListing(account.handle, "old-card");
  await seedRemoval(env.DB, {
    handle: account.handle,
    name: "old-card",
    removedBy: "publisher",
  });
  const neighbour = await seedAccount(env.DB);
  await addListing(neighbour.handle, "charge-card");
  return { account, neighbour };
};

/** Who removed each of a handle's listings, by name. */
const removalsOf = async (handle: string) =>
  Object.fromEntries(
    (
      await db()
        .select({ name: listings.name, removedBy: listings.removedBy })
        .from(listings)
        .where(eq(listings.handle, handle))
    ).map(({ name, removedBy }) => [name, removedBy]),
  );

const deletionRequestedAt = async (accountId: string) =>
  (
    await db()
      .select({ at: accounts.deletionRequestedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .get()
  )?.at;

const providerLinksOf = (accountId: string) =>
  db()
    .select()
    .from(providerAccounts)
    .where(eq(providerAccounts.accountId, accountId));

const isRetired = async (handle: string) =>
  (await db()
    .select()
    .from(retiredHandles)
    .where(eq(retiredHandles.handle, handle))
    .get()) !== undefined;

/** The published rows that must outlive every deletion path: listings, versions and handles. */
const publishedRows = async (account: SeededAccount) => {
  const rows = await readAllRows(env.DB);
  const mine = (row: unknown) =>
    (row as { handle?: string }).handle === account.handle;
  return {
    listings: (rows["listings"] ?? []).filter(mine).length,
    versions: (rows["versions"] ?? []).filter(mine),
    handles: (rows["handles"] ?? []).filter(mine),
    accounts: (rows["accounts"] ?? []).filter(
      (row) => (row as { id: string }).id === account.accountId,
    ).length,
  };
};

describe("requestAccountDeletion", () => {
  test("marks the account pending and removes its listed activities by account deletion", async () => {
    const { account, neighbour } = await accountWithListings();
    const before = Date.now();

    const at = await storage().requestAccountDeletion(account.accountId);

    expect(at).toBeInstanceOf(Date);
    expect(at?.getTime()).toBeGreaterThanOrEqual(
      Math.floor(before / 1000) * 1000,
    );
    expect(await deletionRequestedAt(account.accountId)).toEqual(at);
    expect(await removalsOf(account.handle)).toEqual({
      "charge-card": "account-deletion",
      "refund-card": "account-deletion",
      "old-card": "publisher",
    });
    expect(await removalsOf(neighbour.handle)).toEqual({
      "charge-card": null,
    });
  });

  test("deletes nothing published and keeps the provider links and handle", async () => {
    const { account } = await accountWithListings();
    const before = await publishedRows(account);

    await storage().requestAccountDeletion(account.accountId);

    expect(await publishedRows(account)).toEqual(before);
    expect(await providerLinksOf(account.accountId)).toHaveLength(1);
    expect(await isRetired(account.handle)).toBe(false);
  });

  test("refuses a second request and writes nothing", async () => {
    const { account } = await accountWithListings();
    await storage().requestAccountDeletion(account.accountId);
    // Return one listing to search behind deletion's back, to show the second request
    // does not remove it again.
    await seedRemoval(env.DB, {
      handle: account.handle,
      name: "refund-card",
      removedBy: null,
    });
    const rowsBefore = await readAllRows(env.DB);

    const second = await storage().requestAccountDeletion(account.accountId);

    expect(second).toBeUndefined();
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("finds no account to delete for an unknown ID", async () => {
    const rowsBefore = await readAllRows(env.DB);

    expect(
      await storage().requestAccountDeletion(crypto.randomUUID()),
    ).toBeUndefined();
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });
});

describe("findAccountState", () => {
  test("reports when deletion was asked for, and null when it was not", async () => {
    const { account } = await accountWithListings();

    expect(await storage().findAccountState(account)).toEqual({
      id: account.accountId,
      handle: account.handle,
      deletionRequestedAt: null,
    });

    const at = await storage().requestAccountDeletion(account.accountId);

    expect(await storage().findAccountState(account)).toEqual({
      id: account.accountId,
      handle: account.handle,
      deletionRequestedAt: at,
    });
  });

  test("finds nothing for an identity with no account", async () => {
    expect(
      await storage().findAccountState({
        provider: "github",
        providerAccountId: `nobody-${crypto.randomUUID()}`,
      }),
    ).toBeUndefined();
  });
});

describe("restoreAccount", () => {
  test("returns only the activities account deletion removed, and clears the pending mark", async () => {
    const { account } = await accountWithListings();
    await storage().requestAccountDeletion(account.accountId);

    expect(await storage().restoreAccount(account.accountId)).toBe(true);

    expect(await deletionRequestedAt(account.accountId)).toBeNull();
    expect(await removalsOf(account.handle)).toEqual({
      "charge-card": null,
      "refund-card": null,
      "old-card": "publisher",
    });
  });

  test("leaves a removal by Durables in place", async () => {
    const { account } = await accountWithListings();
    await seedRemoval(env.DB, {
      handle: account.handle,
      name: "refund-card",
      removedBy: "durables",
    });
    await storage().requestAccountDeletion(account.accountId);

    await storage().restoreAccount(account.accountId);

    expect(await removalsOf(account.handle)).toEqual({
      "charge-card": null,
      "refund-card": "durables",
      "old-card": "publisher",
    });
  });

  test("refuses an account that is not pending and writes nothing", async () => {
    const { account } = await accountWithListings();
    // An account-deletion removal on an account that is not pending is left alone.
    await seedRemoval(env.DB, {
      handle: account.handle,
      name: "charge-card",
      removedBy: "account-deletion",
    });
    const rowsBefore = await readAllRows(env.DB);

    expect(await storage().restoreAccount(account.accountId)).toBe(false);
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("refuses an account whose deletion is final and writes nothing", async () => {
    const { account } = await accountWithListings();
    await storage().requestAccountDeletion(account.accountId);
    await storage().finalizeAccountDeletion(account.accountId);
    const rowsBefore = await readAllRows(env.DB);

    expect(await storage().restoreAccount(account.accountId)).toBe(false);
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });
});

describe("finalizeAccountDeletion", () => {
  test("deletes every provider link and retires the handle", async () => {
    const { account } = await accountWithListings();
    await seedProviderLink(env.DB, {
      accountId: account.accountId,
      provider: "gitlab",
      providerAccountId: `second-${crypto.randomUUID()}`,
    });
    await storage().requestAccountDeletion(account.accountId);

    expect(await storage().finalizeAccountDeletion(account.accountId)).toBe(
      true,
    );

    expect(await providerLinksOf(account.accountId)).toEqual([]);
    expect(await isRetired(account.handle)).toBe(true);
    expect(await storage().findAccountState(account)).toBeUndefined();
  });

  test("deletes nothing published, and keeps the account and its handle row", async () => {
    const { account } = await accountWithListings();
    await storage().requestAccountDeletion(account.accountId);
    const before = await publishedRows(account);

    await storage().finalizeAccountDeletion(account.accountId);

    expect(await publishedRows(account)).toEqual(before);
    expect(await removalsOf(account.handle)).toEqual({
      "charge-card": "account-deletion",
      "refund-card": "account-deletion",
      "old-card": "publisher",
    });
  });

  test("never frees the handle: it cannot be claimed again", async () => {
    const { account } = await accountWithListings();
    await storage().requestAccountDeletion(account.accountId);

    await storage().finalizeAccountDeletion(account.accountId);

    expect(await storage().isHandleAvailable(account.handle)).toBe(false);
    expect(
      await storage().createAccount({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        handle: account.handle,
      }),
    ).toEqual({ outcome: "handle-taken" });
  });

  test("lets the same provider account start again as a new account under a new handle", async () => {
    const { account } = await accountWithListings();
    await storage().requestAccountDeletion(account.accountId);
    await storage().finalizeAccountDeletion(account.accountId);
    const handle = `fresh-${crypto.randomUUID().slice(0, 8)}`;

    const result = await storage().createAccount({
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      handle,
    });

    expect(result).toMatchObject({ outcome: "created", account: { handle } });
  });

  test("finalizes nothing twice", async () => {
    const { account } = await accountWithListings();
    await storage().requestAccountDeletion(account.accountId);
    await storage().finalizeAccountDeletion(account.accountId);
    const rowsBefore = await readAllRows(env.DB);

    expect(await storage().finalizeAccountDeletion(account.accountId)).toBe(
      false,
    );
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("refuses an account that is not pending and writes nothing", async () => {
    const { account } = await accountWithListings();
    const rowsBefore = await readAllRows(env.DB);

    expect(await storage().finalizeAccountDeletion(account.accountId)).toBe(
      false,
    );
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
    expect(
      await db()
        .select()
        .from(providerAccounts)
        .where(
          and(
            eq(providerAccounts.accountId, account.accountId),
            eq(providerAccounts.provider, account.provider),
          ),
        ),
    ).toHaveLength(1);
  });
});

describe("listAccountsDueForFinalDeletion", () => {
  const cutoff = new Date("2030-05-02T03:00:00Z");
  const pendingSince = async (deletionRequestedAt: Date) => {
    const { account } = await accountWithListings();
    await storage().requestAccountDeletion(account.accountId);
    await seedDeletionRequest(env.DB, {
      accountId: account.accountId,
      deletionRequestedAt,
    });
    return account;
  };

  test("lists an account whose deletion was asked for at or before the time", async () => {
    const atCutoff = await pendingSince(cutoff);
    const earlier = await pendingSince(new Date("2030-04-01T00:00:00Z"));

    const due = await storage().listAccountsDueForFinalDeletion(cutoff);

    expect(due).toEqual(
      expect.arrayContaining([atCutoff.accountId, earlier.accountId]),
    );
  });

  test("leaves out an account asked for after the time", async () => {
    const later = await pendingSince(new Date(cutoff.getTime() + 1000));

    expect(
      await storage().listAccountsDueForFinalDeletion(cutoff),
    ).not.toContain(later.accountId);
  });

  test("leaves out accounts that are not pending, restored, or already final", async () => {
    const { account: neverDeleted } = await accountWithListings();
    const restored = await pendingSince(new Date("2030-04-01T00:00:00Z"));
    await storage().restoreAccount(restored.accountId);
    const final = await pendingSince(new Date("2030-04-01T00:00:00Z"));
    await storage().finalizeAccountDeletion(final.accountId);

    const due = await storage().listAccountsDueForFinalDeletion(cutoff);

    expect(due).not.toContain(neverDeleted.accountId);
    expect(due).not.toContain(restored.accountId);
    expect(due).not.toContain(final.accountId);
  });

  test("writes nothing", async () => {
    await pendingSince(new Date("2030-04-01T00:00:00Z"));
    const rowsBefore = await readAllRows(env.DB);

    await storage().listAccountsDueForFinalDeletion(cutoff);

    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });
});
