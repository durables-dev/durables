import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { seedAccount, seedProviderLink, seedRetiredHandle } from "./seed";
import { Storage } from "./storage";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

// The database's own message for a rejected write. Drizzle wraps some D1 errors, keeping
// the original as the cause.
const databaseError = async (write: Promise<unknown>): Promise<string> => {
  try {
    await write;
  } catch (error) {
    const { cause } = error as Error;
    return String(cause instanceof Error ? cause.message : error);
  }
  throw new Error("Expected the database to reject the write.");
};

test("reaches the local D1 database", async () => {
  expect(await storage().isAvailable()).toBe(true);
});

describe("finding the account for a provider identity", () => {
  test("returns the account a linked provider identity belongs to", async () => {
    const seeded = await seedAccount(env.DB, { provider: "google" });

    expect(
      await storage().findAccountByProviderIdentity({
        provider: "google",
        providerAccountId: seeded.providerAccountId,
      }),
    ).toEqual({ id: seeded.accountId, handle: seeded.handle });
  });

  test("returns nothing for a provider identity with no account", async () => {
    expect(
      await storage().findAccountByProviderIdentity({
        provider: "github",
        providerAccountId: `unlinked-${crypto.randomUUID()}`,
      }),
    ).toBeUndefined();
  });

  test("matches on the provider as well as the provider's account ID", async () => {
    const seeded = await seedAccount(env.DB, { provider: "gitlab" });

    expect(
      await storage().findAccountByProviderIdentity({
        provider: "microsoft",
        providerAccountId: seeded.providerAccountId,
      }),
    ).toBeUndefined();
  });

  test("returns the same account for every provider identity linked to it", async () => {
    const seeded = await seedAccount(env.DB, { provider: "github" });
    const providerAccountId = `second-${crypto.randomUUID()}`;
    await seedProviderLink(env.DB, {
      accountId: seeded.accountId,
      provider: "microsoft",
      providerAccountId,
    });

    expect(
      await storage().findAccountByProviderIdentity({
        provider: "microsoft",
        providerAccountId,
      }),
    ).toEqual({ id: seeded.accountId, handle: seeded.handle });
  });
});

describe("linking a provider identity", () => {
  test("rejects a second account for an already-linked provider identity", async () => {
    const first = await seedAccount(env.DB, { provider: "github" });
    const second = await seedAccount(env.DB);

    expect(
      await databaseError(
        seedProviderLink(env.DB, {
          accountId: second.accountId,
          provider: "github",
          providerAccountId: first.providerAccountId,
        }),
      ),
    ).toMatch(/UNIQUE constraint failed/);
    expect(
      await storage().findAccountByProviderIdentity({
        provider: "github",
        providerAccountId: first.providerAccountId,
      }),
    ).toEqual({ id: first.accountId, handle: first.handle });
  });

  test("rejects a provider outside the four sign-in providers", async () => {
    const seeded = await seedAccount(env.DB);

    expect(
      await databaseError(
        env.DB.prepare(
          "insert into provider_accounts (provider, provider_account_id, account_id) values (?, ?, ?)",
        )
          .bind("bitbucket", crypto.randomUUID(), seeded.accountId)
          .run(),
      ),
    ).toMatch(/CHECK constraint failed/);
  });

  test("rejects a link to an account that does not exist", async () => {
    expect(
      await databaseError(
        seedProviderLink(env.DB, {
          accountId: crypto.randomUUID(),
          provider: "google",
          providerAccountId: crypto.randomUUID(),
        }),
      ),
    ).toMatch(/FOREIGN KEY constraint failed/);
  });
});

describe("reading handle availability", () => {
  test("reports a handle in use as unavailable", async () => {
    const seeded = await seedAccount(env.DB, { handle: "in-use-handle" });

    expect(await storage().isHandleAvailable(seeded.handle)).toBe(false);
  });

  test("reports a retired handle as unavailable", async () => {
    await seedRetiredHandle(env.DB, "retired-handle");

    expect(await storage().isHandleAvailable("retired-handle")).toBe(false);
  });

  test("reports a handle in neither table as available", async () => {
    await seedAccount(env.DB, { handle: "someone-else" });
    await seedRetiredHandle(env.DB, "long-gone");

    expect(await storage().isHandleAvailable("never-used")).toBe(true);
  });

  test("rejects a second account with a handle already in use", async () => {
    await seedAccount(env.DB, { handle: "claimed" });

    expect(
      await databaseError(seedAccount(env.DB, { handle: "claimed" })),
    ).toMatch(/UNIQUE constraint failed/);
  });
});

describe("the seed helper", () => {
  test("creates a linked account and handle that the lookups read", async () => {
    const seeded = await seedAccount(env.DB);

    expect(
      await storage().findAccountByProviderIdentity({
        provider: seeded.provider,
        providerAccountId: seeded.providerAccountId,
      }),
    ).toEqual({ id: seeded.accountId, handle: seeded.handle });
    expect(await storage().isHandleAvailable(seeded.handle)).toBe(false);
  });

  test("gives each seeded account its own identity and handle", async () => {
    const first = await seedAccount(env.DB);
    const second = await seedAccount(env.DB);

    expect(second.accountId).not.toBe(first.accountId);
    expect(second.providerAccountId).not.toBe(first.providerAccountId);
    expect(second.handle).not.toBe(first.handle);
  });
});
