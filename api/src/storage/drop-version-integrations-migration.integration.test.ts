import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";
import {
  insertListingBeforeChips,
  migration,
  readChips,
  readTables,
  rebuildDatabaseBefore,
  runMigration,
} from "./migration-testing";
import { Storage } from "./storage";

// Migration 0009 drops the versions' integrations column, after migration 0008 has copied each
// listing's highest version's integrations to its chips. The setup file has already applied
// every migration to an empty database, so each test puts the database back as it was just
// before the migration it starts from, writes rows the old way, and runs the migrations' own
// statements again. Storage is isolated per test, so dropping tables here touches no other test.

const addChips = "0007_listing-chips";
const copy = "0008_copy-version-integrations-to-listing-chips";
const drop = "0009_drop-version-integrations";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** The names of a table's columns, in order. */
const columns = async (table: string) =>
  (
    await env.DB.prepare(
      `select name from pragma_table_info(${JSON.stringify(table)})`,
    ).all<{ name: string }>()
  ).results.map(({ name }) => name);

/** Every version row, without the integrations column, in a fixed order. */
const versionsWithoutIntegrations = async () =>
  (
    await env.DB.prepare(
      "select handle, name, version, title, sdk, published_at, description, what_changed, based_on from versions order by handle, name, version",
    ).all()
  ).results;

describe("migration 0009, dropping the versions' integrations", () => {
  beforeEach(async () => {
    await rebuildDatabaseBefore(addChips);
  });

  test("removes the integrations column from versions", async () => {
    await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
    ]);
    await runMigration(addChips);
    await runMigration(copy);
    expect(await columns("versions")).toContain("integrations");

    await runMigration(drop);

    expect(await columns("versions")).toEqual([
      "handle",
      "name",
      "version",
      "title",
      "sdk",
      "published_at",
      "description",
      "what_changed",
      "based_on",
    ]);
  });

  test("keeps the chips the fill migration gave each listing", async () => {
    const several = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
      { version: "1.1.0", integrations: ["Stripe", "Slack"] },
    ]);
    const none = await insertListingBeforeChips([
      { version: "1.0.0", integrations: [] },
    ]);
    await runMigration(addChips);
    await runMigration(copy);

    await runMigration(drop);

    expect(await readChips(several)).toEqual(["Stripe", "Slack"]);
    expect(await readChips(none)).toEqual([]);
  });

  test("leaves every other column of every row unchanged", async () => {
    await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
      { version: "1.1.0", integrations: ["Stripe", "Slack"] },
    ]);
    await runMigration(addChips);
    await runMigration(copy);
    const otherTables = [
      "accounts",
      "provider_accounts",
      "handles",
      "retired_handles",
      "listings",
      "version_deprecations",
    ];
    const before = {
      ...(await readTables(...otherTables)),
      versions: await versionsWithoutIntegrations(),
    };

    await runMigration(drop);

    expect({
      ...(await readTables(...otherTables)),
      versions: await versionsWithoutIntegrations(),
    }).toEqual(before);
  });

  test("leaves the listing readable by storage, with its chips in browse", async () => {
    const listing = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
    ]);
    await runMigration(addChips);
    await runMigration(copy);

    await runMigration(drop);

    expect(
      await storage().findListing({ ...listing, version: "1.0.0" }),
    ).toMatchObject({ ...listing, version: "1.0.0", sdk: "Python" });
    expect(
      await storage().findVersion({ ...listing, version: "1.0.0" }),
    ).toMatchObject({ ...listing, version: "1.0.0", sdk: "Python" });
    const browsed = await storage().browseListings({
      publisher: listing.handle,
      integrations: ["Stripe"],
      limit: 10,
    });
    expect(browsed.listings).toMatchObject([
      { version: "1.0.0", integrations: ["Stripe"] },
    ]);
  });

  test("runs every statement on an empty database", async () => {
    await runMigration(addChips);
    await runMigration(copy);

    await expect(runMigration(drop)).resolves.toHaveLength(
      migration(drop).queries.length,
    );
    expect(await columns("versions")).not.toContain("integrations");
  });
});
