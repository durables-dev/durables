import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";
import {
  insertEarlyListing,
  insertEarlyVersion,
  migration,
  readTables,
  rebuildDatabaseBefore,
  runMigration,
} from "./migration-testing";
import { Storage } from "./storage";

// Migration 0005 gives every version with an empty description its listing's description, and
// migration 0006 then removes the listing's description column (ADR 0015). The setup file has
// already applied both to an empty database, so each test puts the database back as it was just
// before migration 0005, writes rows the old way, and runs the migrations' own statements again.
// Storage is isolated per test, so dropping tables here touches no other test.

const copy = "0005_copy-listing-descriptions-to-versions";
const drop = "0006_drop-listing-description";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** The column names of a table, as SQLite reports them. */
const columnNames = async (table: string) =>
  (
    await env.DB.prepare(`pragma table_xinfo(${table})`).all<{
      name: string;
    }>()
  ).results.map(({ name }) => name);

/** The description stored for the version at an address. */
const versionDescription = async ({
  handle,
  name,
  version,
}: {
  handle: string;
  name: string;
  version: string;
}) =>
  (
    await env.DB.prepare(
      "select description from versions where handle = ? and name = ? and version = ?",
    )
      .bind(handle, name, version)
      .first<{ description: string }>()
  )?.description;

/** Sets a version's description with plain SQL, in the columns migration 0004 created. */
const writeVersionDescription = (
  { handle, name }: { handle: string; name: string },
  version: string,
  description: string,
) =>
  env.DB.prepare(
    "update versions set description = ? where handle = ? and name = ? and version = ?",
  )
    .bind(description, handle, name, version)
    .run();

/**
 * Every row of every table with plain SQL, and each listing's handle, name and removal state,
 * which are the listing columns that migration 0006 keeps. Later migrations add listing columns
 * the storage schema reads, so the rows are not read through it.
 */
const readRowsKeptByDrop = async () => ({
  ...(await readTables(
    "accounts",
    "provider_accounts",
    "handles",
    "retired_handles",
    "versions",
    "version_deprecations",
  )),
  listings: (
    await env.DB.prepare(
      "select handle, name, removed_by from listings order by handle, name",
    ).all()
  ).results,
});

describe("migration 0005, copying listing descriptions to empty versions", () => {
  beforeEach(async () => {
    await rebuildDatabaseBefore(copy);
  });

  test("gives every version with an empty description its listing's description", async () => {
    // A first publish between migration 0004 and this story wrote the description to the
    // listing only, so its version's description is empty.
    const listing = await insertEarlyListing({
      description: "Charges a card and returns the receipt.",
    });
    await insertEarlyVersion(listing, { version: "1.1.0" });
    expect(await versionDescription(listing)).toBe("");

    await runMigration(copy);

    expect(await versionDescription(listing)).toBe(listing.description);
    expect(await versionDescription({ ...listing, version: "1.1.0" })).toBe(
      listing.description,
    );
  });

  test("leaves a version that already has a description unchanged", async () => {
    const listing = await insertEarlyListing({
      description: "The listing's description.",
    });
    await insertEarlyVersion(listing, { version: "1.1.0" });
    await writeVersionDescription(listing, "1.0.0", "Version 1.0.0's own.");

    await runMigration(copy);

    expect(await versionDescription(listing)).toBe("Version 1.0.0's own.");
    expect(await versionDescription({ ...listing, version: "1.1.0" })).toBe(
      "The listing's description.",
    );
  });

  test("takes each version's description from its own listing only", async () => {
    const upload = await insertEarlyListing({
      description: "Uploads a CSV report and returns where it is.",
    });
    const charge = await insertEarlyListing({
      description: "Charges a card and returns the receipt.",
    });

    await runMigration(copy);

    expect(await versionDescription(upload)).toBe(upload.description);
    expect(await versionDescription(charge)).toBe(charge.description);
  });

  test("leaves a version empty when its listing's description is empty", async () => {
    const listing = await insertEarlyListing({ description: "" });

    await runMigration(copy);

    expect(await versionDescription(listing)).toBe("");
  });

  test("changes no other column of any version", async () => {
    await insertEarlyListing({ sdk: "TypeScript", integrations: ["Slack"] });
    const columns =
      "handle, name, version, title, sdk, integrations, published_at, what_changed, based_on";
    const read = async () =>
      (
        await env.DB.prepare(
          `select ${columns} from versions order by handle, name, version`,
        ).all()
      ).results;
    const before = await read();

    await runMigration(copy);

    expect(await read()).toEqual(before);
  });

  test("runs every statement on an empty database", async () => {
    await expect(runMigration(copy)).resolves.toHaveLength(
      migration(copy).queries.length,
    );
  });
});

describe("migration 0006, removing the listing's description", () => {
  beforeEach(async () => {
    await rebuildDatabaseBefore(copy);
  });

  test("runs after the copy, so every version keeps its listing's description", async () => {
    const listing = await insertEarlyListing({
      description: "Charges a card and returns the receipt.",
    });
    await insertEarlyVersion(listing, { version: "1.1.0" });

    await runMigration(copy);
    await runMigration(drop);

    expect(await columnNames("listings")).not.toContain("description");
    expect(await storage().findListingVersions(listing)).toMatchObject({
      versions: [
        { version: "1.1.0", description: listing.description },
        { version: "1.0.0", description: listing.description },
      ],
    });
  });

  test("keeps every listing, its removal state and its versions", async () => {
    await insertEarlyListing();
    await insertEarlyListing();
    await runMigration(copy);
    const before = await readRowsKeptByDrop();

    await runMigration(drop);

    expect(await readRowsKeptByDrop()).toEqual(before);
    expect(
      (await env.DB.prepare("pragma foreign_key_check").all()).results,
    ).toEqual([]);
  });

  test("runs every statement on an empty database", async () => {
    await runMigration(copy);

    await expect(runMigration(drop)).resolves.toHaveLength(
      migration(drop).queries.length,
    );
  });
});
