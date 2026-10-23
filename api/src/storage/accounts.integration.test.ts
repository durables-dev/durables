import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { readAllRows, seedAccount, seedRetiredHandle } from "./seed";
import { Storage, type NewAccount, type Provider } from "./storage";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** A provider identity and handle that no other test uses. */
const newAccount = (account: Partial<NewAccount> = {}): NewAccount => {
  const unique = crypto.randomUUID();
  return {
    provider: "github",
    providerAccountId: `publisher-${unique}`,
    handle: `publisher-${unique.slice(0, 8)}`,
    ...account,
  };
};

describe("creating an account on first publish", () => {
  test("creates the account, its provider link and its handle", async () => {
    const account = newAccount({ provider: "gitlab" });
    const rowsBefore = await readAllRows(env.DB);

    const result = await storage().createAccount(account);

    expect(result).toEqual({
      outcome: "created",
      account: { id: expect.any(String) as string, handle: account.handle },
    });
    if (result.outcome !== "created") {
      throw new Error("Expected the account to be created.");
    }
    const { id } = result.account;
    const rowsAfter = await readAllRows(env.DB);
    /** The rows a table gained, compared by content so table order does not matter. */
    const added = (table: string) =>
      (rowsAfter[table] ?? []).filter(
        (row) =>
          !(rowsBefore[table] ?? []).some(
            (before) => JSON.stringify(before) === JSON.stringify(row),
          ),
      );
    expect(added("accounts")).toEqual([
      { id, createdAt: expect.any(Date) as Date },
    ]);
    expect(added("providerAccounts")).toEqual([
      {
        provider: "gitlab",
        providerAccountId: account.providerAccountId,
        accountId: id,
        createdAt: expect.any(Date) as Date,
      },
    ]);
    expect(added("handles")).toEqual([
      {
        handle: account.handle,
        accountId: id,
        createdAt: expect.any(Date) as Date,
      },
    ]);
    for (const table of ["retiredHandles", "listings", "versions"]) {
      expect(added(table)).toEqual([]);
    }
  });

  test("is read back by the provider identity and holds the handle", async () => {
    const account = newAccount({ provider: "microsoft" });

    const result = await storage().createAccount(account);

    expect(
      await storage().findAccountByProviderIdentity({
        provider: "microsoft",
        providerAccountId: account.providerAccountId,
      }),
    ).toEqual(result.outcome === "created" ? result.account : undefined);
    expect(await storage().isHandleAvailable(account.handle)).toBe(false);
  });

  test("gives each new publisher an account of their own", async () => {
    const first = await storage().createAccount(newAccount());
    const second = await storage().createAccount(newAccount());

    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("created");
    if (first.outcome !== "created" || second.outcome !== "created") {
      throw new Error("Expected both accounts to be created.");
    }
    expect(second.account.id).not.toBe(first.account.id);
  });
});

describe("creating an account with a handle that is not free", () => {
  test("fails with handle-taken and writes nothing when another account holds it", async () => {
    const holder = await seedAccount(env.DB);
    const account = newAccount({ handle: holder.handle });
    const rowsBefore = await readAllRows(env.DB);

    const result = await storage().createAccount(account);

    expect(result).toEqual({ outcome: "handle-taken" });
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
    expect(
      await storage().findAccountByProviderIdentity(account),
    ).toBeUndefined();
  });

  test("treats a retired handle as taken and writes nothing", async () => {
    const account = newAccount();
    await seedRetiredHandle(env.DB, account.handle);
    const rowsBefore = await readAllRows(env.DB);

    const result = await storage().createAccount(account);

    expect(result).toEqual({ outcome: "handle-taken" });
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
    expect(
      await storage().findAccountByProviderIdentity(account),
    ).toBeUndefined();
  });
});

describe("creating an account that already exists", () => {
  test("writes nothing and reports the existing account as not created", async () => {
    const seeded = await seedAccount(env.DB, { provider: "google" });
    const rowsBefore = await readAllRows(env.DB);

    const result = await storage().createAccount({
      provider: "google",
      providerAccountId: seeded.providerAccountId,
      handle: seeded.handle,
    });

    expect(result).toEqual({
      outcome: "existing",
      account: { id: seeded.accountId, handle: seeded.handle },
    });
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("keeps the existing handle when another handle is passed", async () => {
    const seeded = await seedAccount(env.DB);
    const rowsBefore = await readAllRows(env.DB);

    const result = await storage().createAccount({
      provider: seeded.provider,
      providerAccountId: seeded.providerAccountId,
      handle: `other-${crypto.randomUUID().slice(0, 8)}`,
    });

    expect(result).toEqual({
      outcome: "existing",
      account: { id: seeded.accountId, handle: seeded.handle },
    });
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("reports the account created by an earlier call as existing", async () => {
    const account = newAccount();
    const first = await storage().createAccount(account);
    const rowsBefore = await readAllRows(env.DB);

    const second = await storage().createAccount(account);

    expect(second).toEqual({
      outcome: "existing",
      account: first.outcome === "created" ? first.account : undefined,
    });
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });
});

describe("a batch that fails partway", () => {
  test("leaves no partial rows and raises the failure", async () => {
    // The account row is written first; the provider link then fails its CHECK constraint.
    const account = newAccount({ provider: "bitbucket" as Provider });
    const rowsBefore = await readAllRows(env.DB);

    await expect(storage().createAccount(account)).rejects.toThrow();

    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
    expect(await storage().isHandleAvailable(account.handle)).toBe(true);
  });
});
