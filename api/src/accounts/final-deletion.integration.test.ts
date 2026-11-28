import {
  createExecutionContext,
  createScheduledController,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, test } from "vitest";
import localWorker from "../dev";
import productionWorker from "../index";
import { listings, providerAccounts, retiredHandles } from "../storage/schema";
import {
  readAllRows,
  seedAccount,
  seedDeletionRequest,
  seedListing,
  seedVersion,
  type SeededAccount,
} from "../storage/seed";
import { Storage } from "../storage/storage";
import { scheduled } from "./final-deletion";

// The daily final-deletion job (ADR 0015), run through the Worker's scheduled handler against
// real local D1. Every run happens at the same fixed time, and each test places its accounts'
// deletions relative to it, so accounts from other tests are never due when a test does not
// expect them to be.

const runAt = new Date("2030-06-01T03:00:00Z");
const dayMs = 24 * 60 * 60 * 1000;
const daysBefore = (days: number) => new Date(runAt.getTime() - days * dayMs);

const storage = () => new Storage(env.DB, env.DOCUMENTS);
const db = () => drizzle(env.DB);

/** Runs the Worker's scheduled handler as the daily Cron Trigger would, at the given time. */
const runJob = async (at: Date = runAt) => {
  await localWorker.scheduled(
    createScheduledController({
      scheduledTime: at.getTime(),
      cron: "0 3 * * *",
    }),
    env,
    createExecutionContext(),
  );
};

/** An account with one published activity, whose deletion was asked for at the given time. */
const deletedAccount = async (
  deletionRequestedAt: Date,
): Promise<SeededAccount> => {
  const account = await seedAccount(env.DB);
  await seedListing(env.DB, { handle: account.handle, name: "charge-card" });
  await seedVersion(env.DB, {
    handle: account.handle,
    name: "charge-card",
    version: "1.0.0",
    title: "Charge card",
    sdk: "Python",
    description: "Charges a card.",
  });
  await storage().requestAccountDeletion(account.accountId);
  await seedDeletionRequest(env.DB, {
    accountId: account.accountId,
    deletionRequestedAt,
  });
  return account;
};

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

/** Every row that mentions this account, by its ID or its handle. */
const rowsOf = async (account: SeededAccount) => {
  const rows = await readAllRows(env.DB);
  const mine = (row: unknown) => {
    const { accountId, id, handle } = row as {
      accountId?: string;
      id?: string;
      handle?: string;
    };
    return (
      accountId === account.accountId ||
      id === account.accountId ||
      handle === account.handle
    );
  };
  return Object.fromEntries(
    Object.entries(rows).map(([table, tableRows]) => [
      table,
      tableRows.filter(mine),
    ]),
  );
};

describe("the daily final-deletion job", () => {
  test("finalizes an account pending exactly 30 days: provider links deleted, handle retired", async () => {
    const account = await deletedAccount(daysBefore(30));

    await runJob();

    expect(await providerLinksOf(account.accountId)).toEqual([]);
    expect(await isRetired(account.handle)).toBe(true);
    expect(await storage().findAccountState(account)).toBeUndefined();
  });

  test("finalizes an account pending more than 30 days", async () => {
    const account = await deletedAccount(daysBefore(45));

    await runJob();

    expect(await providerLinksOf(account.accountId)).toEqual([]);
    expect(await isRetired(account.handle)).toBe(true);
  });

  test("leaves an account pending 29 days untouched", async () => {
    const account = await deletedAccount(daysBefore(29));
    const before = await rowsOf(account);

    await runJob();

    expect(await rowsOf(account)).toEqual(before);
    expect(await providerLinksOf(account.accountId)).toHaveLength(1);
    expect(await isRetired(account.handle)).toBe(false);
  });

  test("leaves an account one second short of 30 days untouched", async () => {
    const account = await deletedAccount(
      new Date(daysBefore(30).getTime() + 1000),
    );
    const before = await rowsOf(account);

    await runJob();

    expect(await rowsOf(account)).toEqual(before);
  });

  test("leaves a restored account untouched", async () => {
    const account = await deletedAccount(daysBefore(40));
    expect(await storage().restoreAccount(account.accountId)).toBe(true);
    const before = await rowsOf(account);

    await runJob();

    expect(await rowsOf(account)).toEqual(before);
    expect(await providerLinksOf(account.accountId)).toHaveLength(1);
    expect(await isRetired(account.handle)).toBe(false);
  });

  test("leaves an account that was never deleted untouched", async () => {
    const account = await seedAccount(env.DB);
    const before = await rowsOf(account);

    await runJob();

    expect(await rowsOf(account)).toEqual(before);
  });

  test("changes nothing when no deletion is due", async () => {
    await deletedAccount(daysBefore(31));
    const before = await readAllRows(env.DB);

    // A run long before any test's deletion: nothing is due.
    await runJob(new Date("2000-01-01T03:00:00Z"));

    expect(await readAllRows(env.DB)).toEqual(before);
  });

  test("a second run on the same day finalizes nothing twice", async () => {
    const account = await deletedAccount(daysBefore(30));
    await runJob();
    const before = await readAllRows(env.DB);

    await runJob();

    expect(await readAllRows(env.DB)).toEqual(before);
    expect(await isRetired(account.handle)).toBe(true);
  });

  test("deletes nothing published: the account, handle, listing and version stay", async () => {
    const account = await deletedAccount(daysBefore(30));
    const before = await rowsOf(account);

    await runJob();

    const after = await rowsOf(account);
    expect(after["accounts"]).toEqual(before["accounts"]);
    expect(after["handles"]).toEqual(before["handles"]);
    expect(after["listings"]).toEqual(before["listings"]);
    expect(after["versions"]).toEqual(before["versions"]);
    expect(
      await db()
        .select({ removedBy: listings.removedBy })
        .from(listings)
        .where(eq(listings.handle, account.handle)),
    ).toEqual([{ removedBy: "account-deletion" }]);
  });

  test("the retired handle stays retired and cannot be claimed", async () => {
    const account = await deletedAccount(daysBefore(30));

    await runJob();
    await runJob();

    expect(await isRetired(account.handle)).toBe(true);
    expect(await storage().isHandleAvailable(account.handle)).toBe(false);
    expect(
      await storage().createAccount({
        provider: "gitlab",
        providerAccountId: `newcomer-${crypto.randomUUID()}`,
        handle: account.handle,
      }),
    ).toEqual({ outcome: "handle-taken" });
  });

  test("finalizes every due account in one run, and only those", async () => {
    const due = [
      await deletedAccount(daysBefore(30)),
      await deletedAccount(daysBefore(60)),
    ];
    const notDue = await deletedAccount(daysBefore(10));

    await runJob();

    for (const account of due) {
      expect(await providerLinksOf(account.accountId)).toEqual([]);
      expect(await isRetired(account.handle)).toBe(true);
    }
    expect(await providerLinksOf(notDue.accountId)).toHaveLength(1);
    expect(await isRetired(notDue.handle)).toBe(false);
  });
});

describe("the Worker's entry points", () => {
  test("the production and local entry points both run the final-deletion job", () => {
    expect(productionWorker.scheduled).toBe(scheduled);
    expect(localWorker.scheduled).toBe(scheduled);
  });
});
