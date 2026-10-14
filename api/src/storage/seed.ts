import { drizzle } from "drizzle-orm/d1";
import {
  accounts,
  handles,
  providerAccounts,
  retiredHandles,
  type Provider,
} from "./schema";

// Test-only writes. Accounts and handles are written at publish ("Epic: Describe and
// publish a listing"); until then, tests seed them here. Never import this from a route.

/** What seedAccount creates. */
export interface SeededAccount {
  accountId: string;
  provider: Provider;
  providerAccountId: string;
  handle: string;
}

/**
 * Creates an account linked to one provider identity, with a handle. Every field is
 * optional, and the defaults are unique per call so tests do not collide.
 */
export const seedAccount = async (
  database: D1Database,
  seed: Partial<SeededAccount> = {},
): Promise<SeededAccount> => {
  const unique = crypto.randomUUID();
  const account: SeededAccount = {
    accountId: seed.accountId ?? unique,
    provider: seed.provider ?? "github",
    providerAccountId: seed.providerAccountId ?? `seed-${unique}`,
    handle: seed.handle ?? `seed-${unique.slice(0, 8)}`,
  };
  const db = drizzle(database);
  await db.batch([
    db.insert(accounts).values({ id: account.accountId }),
    db.insert(providerAccounts).values({
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      accountId: account.accountId,
    }),
    db
      .insert(handles)
      .values({ handle: account.handle, accountId: account.accountId }),
  ]);
  return account;
};

/** Links another provider identity to an existing account. */
export const seedProviderLink = async (
  database: D1Database,
  link: { accountId: string; provider: Provider; providerAccountId: string },
): Promise<void> => {
  await drizzle(database).insert(providerAccounts).values(link);
};

/** Records a handle as retired. */
export const seedRetiredHandle = async (
  database: D1Database,
  handle: string,
): Promise<void> => {
  await drizzle(database).insert(retiredHandles).values({ handle });
};
