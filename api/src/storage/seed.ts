import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  accounts,
  handles,
  listings,
  providerAccounts,
  retiredHandles,
  versionDeprecations,
  versions,
  type Provider,
  type RemovalSource,
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

/**
 * Marks an account pending deletion as if it had been asked for at the given time, so a test can
 * place a deletion anywhere in its 30 days. Null clears the mark, as a restore does.
 */
export const seedDeletionRequest = async (
  database: D1Database,
  account: { accountId: string; deletionRequestedAt: Date | null },
): Promise<void> => {
  await drizzle(database)
    .update(accounts)
    .set({ deletionRequestedAt: account.deletionRequestedAt })
    .where(eq(accounts.id, account.accountId));
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
 * the database step of a publish fail after its document is written, or add versions with
 * seedVersion. Its chips default to none.
 */
export const seedListing = async (
  database: D1Database,
  listing: { handle: string; name: string; chips?: string[] },
): Promise<void> => {
  await drizzle(database).insert(listings).values(listing);
};

/**
 * Sets a listing's chips directly, as an operator's migration does. Publishing gives a listing
 * none, so a test that browses by chip sets them here.
 */
export const seedChips = async (
  database: D1Database,
  listing: { handle: string; name: string; chips: string[] },
): Promise<void> => {
  await drizzle(database)
    .update(listings)
    .set({ chips: listing.chips })
    .where(
      and(eq(listings.handle, listing.handle), eq(listings.name, listing.name)),
    );
};

/**
 * Adds a version under an existing listing. Publishing creates only a listing's first
 * version; later versions are a later increment, so tests write them here. The published date
 * defaults to now, and the description to empty.
 */
export const seedVersion = async (
  database: D1Database,
  version: {
    handle: string;
    name: string;
    version: string;
    title: string;
    sdk: Sdk;
    publishedAt?: Date;
    description?: string;
    whatChanged?: string | null;
    basedOn?: string | null;
  },
): Promise<void> => {
  await drizzle(database).insert(versions).values(version);
};

/**
 * Changes a version's current description directly, so a test that reads the listing need not
 * sign in and save it.
 */
export const seedDescription = async (
  database: D1Database,
  version: {
    handle: string;
    name: string;
    version: string;
    description: string;
  },
): Promise<void> => {
  await drizzle(database)
    .update(versions)
    .set({ description: version.description })
    .where(
      and(
        eq(versions.handle, version.handle),
        eq(versions.name, version.name),
        eq(versions.version, version.version),
      ),
    );
};

/**
 * Records a version's deprecation directly, so a test that reads the listing need not sign in
 * and deprecate it.
 */
export const seedDeprecation = async (
  database: D1Database,
  deprecation: {
    handle: string;
    name: string;
    version: string;
    reason: string;
    replacement?: string | null;
  },
): Promise<void> => {
  await drizzle(database).insert(versionDeprecations).values(deprecation);
};

/** Records who removed a listing from search, or null to list it again, directly. */
export const seedRemoval = async (
  database: D1Database,
  listing: { handle: string; name: string; removedBy: RemovalSource | null },
): Promise<void> => {
  await drizzle(database)
    .update(listings)
    .set({ removedBy: listing.removedBy })
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
    versionDeprecationRows,
  ] = await db.batch([
    db.select().from(accounts),
    db.select().from(providerAccounts),
    db.select().from(handles),
    db.select().from(retiredHandles),
    db.select().from(listings),
    db.select().from(versions),
    db.select().from(versionDeprecations),
  ]);
  return {
    accounts: accountRows,
    providerAccounts: providerAccountRows,
    handles: handleRows,
    retiredHandles: retiredHandleRows,
    listings: listingRows,
    versions: versionRows,
    versionDeprecations: versionDeprecationRows,
  };
};
