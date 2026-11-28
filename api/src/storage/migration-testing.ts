import { env } from "cloudflare:workers";
import { inject } from "vitest";
import { seedAccount, seedChips } from "./seed";
import type { Sdk } from "./schema";
import { Storage, type NewListing } from "./storage";

// Test-only helpers for the migration integration tests, which write rows the old way and run a
// migration's own statements again. Never import this from a route.

/** The position of the migration whose name starts with the given prefix, in the order applied. */
const migrationIndex = (prefix: string) => {
  const index = inject("d1Migrations").findIndex(({ name }) =>
    name.startsWith(prefix),
  );
  if (index === -1) {
    throw new Error(`Migration ${prefix} is missing.`);
  }
  return index;
};

/** The migration whose name starts with the given prefix, as the setup file applied it. */
export const migration = (prefix: string) => {
  const found = inject("d1Migrations")[migrationIndex(prefix)];
  if (found === undefined) {
    throw new Error(`Migration ${prefix} is missing.`);
  }
  return found;
};

/**
 * Runs a migration's statements in one batch, as Wrangler runs a migration file, and returns
 * how many rows each statement changed.
 */
export const runMigration = async (prefix: string): Promise<number[]> => {
  const results = await env.DB.batch(
    migration(prefix).queries.map((query) => env.DB.prepare(query)),
  );
  return results.map(({ meta }) => meta.changes);
};

/** Runs each given migration's statements in turn, in the order given. */
const runMigrations = async (
  migrations: readonly { name: string }[],
): Promise<void> => {
  for (const { name } of migrations) {
    await runMigration(name);
  }
};

/**
 * Puts the database back exactly as it was just before the named migration: drops every table
 * the migrations created, then runs each earlier migration in order. Storage is isolated per
 * test, so this touches no other test. Rows written afterwards must use the columns of that
 * time, so write them with the early writers below rather than with Storage or the seed module.
 */
export const rebuildDatabaseBefore = async (prefix: string): Promise<void> => {
  const { results } = await env.DB.prepare(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite\\_%' escape '\\' and name not like '\\_cf\\_%' escape '\\' and name <> 'd1_migrations'",
  ).all<{ name: string }>();
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = true"),
    ...results.map(({ name }) =>
      env.DB.prepare(`DROP TABLE ${JSON.stringify(name)}`),
    ),
  ]);
  await runMigrations(inject("d1Migrations").slice(0, migrationIndex(prefix)));
};

/** Runs every migration after the named one, so the database matches the storage schema again. */
export const runMigrationsAfter = (prefix: string): Promise<void> =>
  runMigrations(inject("d1Migrations").slice(migrationIndex(prefix) + 1));

/** Every row of each named table, exactly as stored, read with plain SQL. */
export const readTables = async (
  ...tables: string[]
): Promise<Record<string, unknown[]>> =>
  Object.fromEntries(
    await Promise.all(
      tables.map(async (table): Promise<[string, unknown[]]> => [
        table,
        (
          await env.DB.prepare(`select * from ${JSON.stringify(table)}`).all<
            Record<string, unknown>
          >()
        ).results,
      ]),
    ),
  );

/** A version written by insertEarlyVersion. */
export interface EarlyVersion {
  version: string;
  title?: string;
  sdk?: Sdk;
  integrations?: string[];
  publishedAt?: Date;
}

/**
 * Writes a version under an existing listing with plain SQL, in the columns migrations 0001
 * to 0003 created, so it can be written before any later migration.
 */
export const insertEarlyVersion = async (
  { handle, name }: { handle: string; name: string },
  {
    version,
    title = "Upload report",
    sdk = "Python",
    integrations = [],
    publishedAt = new Date(),
  }: EarlyVersion,
): Promise<void> => {
  await env.DB.prepare(
    "insert into versions (handle, name, version, title, sdk, integrations, published_at) values (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      handle,
      name,
      version,
      title,
      sdk,
      JSON.stringify(integrations),
      Math.floor(publishedAt.getTime() / 1000),
    )
    .run();
};

/**
 * An account with a handle and a listing with its first version, written with plain SQL in the
 * columns migrations 0000 to 0003 created, so it can be written before any later migration.
 * The handle and name are unique per call.
 */
export const insertEarlyListing = async ({
  description = "Uploads a CSV report and returns where it is.",
  version = "1.0.0",
  title = "Upload report",
  sdk = "Python",
  integrations = [],
  publishedAt = new Date("2026-10-01T12:00:00Z"),
}: Partial<EarlyVersion> & { description?: string } = {}): Promise<
  NewListing & { publishedAt: Date }
> => {
  const unique = crypto.randomUUID();
  const handle = `early-${unique.slice(0, 8)}`;
  const name = `activity-${unique.slice(9, 13)}`;
  await env.DB.batch([
    env.DB.prepare("insert into accounts (id) values (?)").bind(unique),
    env.DB.prepare(
      "insert into provider_accounts (provider, provider_account_id, account_id) values ('github', ?, ?)",
    ).bind(`early-${unique}`, unique),
    env.DB.prepare(
      "insert into handles (handle, account_id) values (?, ?)",
    ).bind(handle, unique),
    env.DB.prepare(
      "insert into listings (handle, name, description) values (?, ?, ?)",
    ).bind(handle, name, description),
  ]);
  const listing = {
    handle,
    name,
    version,
    title,
    description,
    sdk,
    integrations,
    publishedAt,
  };
  await insertEarlyVersion(listing, listing);
  return listing;
};

/**
 * An account with a handle and a listing with the given versions, written with plain SQL in the
 * columns migrations 0000 to 0006 created, so it can be written before migration 0007 adds the
 * listing's chips. The listing has no description column, and each version's description is
 * empty. The handle and name are unique per call.
 */
export const insertListingBeforeChips = async (
  versionRows: readonly EarlyVersion[] = [{ version: "1.0.0" }],
): Promise<{ handle: string; name: string }> => {
  const unique = crypto.randomUUID();
  const listing = {
    handle: `early-${unique.slice(0, 8)}`,
    name: `activity-${unique.slice(9, 13)}`,
  };
  await env.DB.batch([
    env.DB.prepare("insert into accounts (id) values (?)").bind(unique),
    env.DB.prepare(
      "insert into provider_accounts (provider, provider_account_id, account_id) values ('github', ?, ?)",
    ).bind(`early-${unique}`, unique),
    env.DB.prepare(
      "insert into handles (handle, account_id) values (?, ?)",
    ).bind(listing.handle, unique),
    env.DB.prepare("insert into listings (handle, name) values (?, ?)").bind(
      listing.handle,
      listing.name,
    ),
  ]);
  for (const row of versionRows) {
    await insertEarlyVersion(listing, row);
  }
  return listing;
};

/** A listing's chips exactly as stored, read with plain SQL, or undefined when it has no row. */
export const readChips = async ({
  handle,
  name,
}: {
  handle: string;
  name: string;
}): Promise<unknown> => {
  const row = await env.DB.prepare(
    "select chips from listings where handle = ? and name = ?",
  )
    .bind(handle, name)
    .first<{ chips: string }>();
  return row === null ? undefined : JSON.parse(row.chips);
};

/**
 * A listing and its first version, published the way publishing stores them, under a name no
 * other test uses. Publishing gives a listing no chips, so any chips given are set afterwards,
 * as an operator's migration would.
 */
export const storedListing = async ({
  sdk = "Python",
  chips,
}: {
  sdk?: NewListing["sdk"];
  chips?: string[];
} = {}): Promise<NewListing> => {
  const listing: NewListing = {
    handle: (await seedAccount(env.DB)).handle,
    name: `activity-${crypto.randomUUID().slice(0, 8)}`,
    version: "1.0.0",
    title: "Upload report",
    description: "Uploads a CSV report and returns where it is.",
    sdk,
  };
  await new Storage(env.DB, env.DOCUMENTS).createListing(listing);
  if (chips !== undefined) {
    await seedChips(env.DB, { ...listing, chips });
  }
  return listing;
};
