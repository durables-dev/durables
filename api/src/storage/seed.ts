import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  accounts,
  handles,
  listings,
  providerAccounts,
  retiredHandles,
  versions,
  type Provider,
  type Sdk,
} from "./schema";

// Test-only writes and reads. Accounts and handles are written at publish ("Epic: Describe and
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

/**
 * Adds a listing with no version under it. Publishing never leaves one, so tests use it to make
 * the database step of a publish fail after its document is written.
 */
export const seedListing = async (
  database: D1Database,
  listing: { handle: string; name: string; description: string },
): Promise<void> => {
  await drizzle(database).insert(listings).values(listing);
};

/**
 * Adds a version under an existing listing. Publishing creates only a listing's first
 * version; later versions are a later increment, so tests write them here.
 */
export const seedVersion = async (
  database: D1Database,
  version: {
    handle: string;
    name: string;
    version: string;
    title: string;
    sdk: Sdk;
    integrations: string[];
  },
): Promise<void> => {
  await drizzle(database).insert(versions).values(version);
};

/**
 * Changes a listing's current description. Editing a description is a later increment, so
 * tests change it here.
 */
export const seedDescription = async (
  database: D1Database,
  listing: { handle: string; name: string; description: string },
): Promise<void> => {
  await drizzle(database)
    .update(listings)
    .set({ description: listing.description })
    .where(
      and(eq(listings.handle, listing.handle), eq(listings.name, listing.name)),
    );
};

/** Every row in every table, so a test can check what was stored. */
export const readAllRows = async (
  database: D1Database,
): Promise<Record<string, unknown[]>> => {
  const db = drizzle(database);
  const [
    accountRows,
    providerAccountRows,
    handleRows,
    retiredHandleRows,
    listingRows,
    versionRows,
  ] = await db.batch([
    db.select().from(accounts),
    db.select().from(providerAccounts),
    db.select().from(handles),
    db.select().from(retiredHandles),
    db.select().from(listings),
    db.select().from(versions),
  ]);
  return {
    accounts: accountRows,
    providerAccounts: providerAccountRows,
    handles: handleRows,
    retiredHandles: retiredHandleRows,
    listings: listingRows,
    versions: versionRows,
  };
};
