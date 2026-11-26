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

// Migration 0007 adds the listing's chips, and migration 0008 fills them from each listing's
// highest version's integrations. The setup file has already applied both to an empty database,
// so each test puts the database back as it was just before migration 0007, writes rows the old
// way, and runs the migrations' own statements again. Storage is isolated per test, so dropping
// tables here touches no other test.

const addChips = "0007_listing-chips";
const copy = "0008_copy-version-integrations-to-listing-chips";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

describe("migration 0007, adding the listing's chips", () => {
  beforeEach(async () => {
    await rebuildDatabaseBefore(addChips);
  });

  test("gives every existing listing an empty list", async () => {
    const listing = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
    ]);

    await runMigration(addChips);

    expect(await readChips(listing)).toEqual([]);
  });

  test("runs every statement on an empty database", async () => {
    await expect(runMigration(addChips)).resolves.toHaveLength(
      migration(addChips).queries.length,
    );
  });
});

describe("migration 0008, copying the highest version's integrations to the listing's chips", () => {
  beforeEach(async () => {
    await rebuildDatabaseBefore(addChips);
  });

  test("gives each listing its highest version's integrations", async () => {
    const listing = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
    ]);
    await runMigration(addChips);

    await runMigration(copy);

    expect(await readChips(listing)).toEqual(["Stripe"]);
  });

  test("takes the highest version number, comparing each part as a number, not the newest", async () => {
    const listing = await insertListingBeforeChips([
      {
        version: "1.10.0",
        integrations: ["Slack", "Postgres"],
        publishedAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        version: "1.9.0",
        integrations: ["Stripe"],
        publishedAt: new Date("2026-10-02T00:00:00Z"),
      },
      { version: "0.12.3", integrations: ["Redis"] },
    ]);
    await runMigration(addChips);

    await runMigration(copy);

    expect(await readChips(listing)).toEqual(["Slack", "Postgres"]);
  });

  test("gives a listing whose highest version has no integrations an empty list", async () => {
    const listing = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
      { version: "2.0.0", integrations: [] },
    ]);
    await runMigration(addChips);

    await runMigration(copy);

    expect(await readChips(listing)).toEqual([]);
  });

  test("takes each listing's chips from its own versions only", async () => {
    const stripe = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
    ]);
    const slack = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Slack"] },
    ]);
    await runMigration(addChips);

    await runMigration(copy);

    expect(await readChips(stripe)).toEqual(["Stripe"]);
    expect(await readChips(slack)).toEqual(["Slack"]);
  });

  test("copies the chips of a removed listing too", async () => {
    const listing = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
    ]);
    await env.DB.prepare(
      "update listings set removed_by = 'publisher' where handle = ? and name = ?",
    )
      .bind(listing.handle, listing.name)
      .run();
    await runMigration(addChips);

    await runMigration(copy);

    expect(await readChips(listing)).toEqual(["Stripe"]);
  });

  test("leaves every version and the rest of each listing unchanged", async () => {
    await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
      { version: "1.1.0", integrations: ["Stripe", "Slack"] },
    ]);
    await runMigration(addChips);
    const read = async () => ({
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
    const before = await read();

    await runMigration(copy);

    expect(await read()).toEqual(before);
  });

  test("leaves browse showing the chips the listing had from its highest version", async () => {
    const listing = await insertListingBeforeChips([
      { version: "1.0.0", integrations: ["Stripe"] },
      { version: "1.1.0", integrations: ["Stripe", "Slack"] },
    ]);
    await runMigration(addChips);

    await runMigration(copy);

    const browsed = await storage().browseListings({
      publisher: listing.handle,
      integrations: ["Slack"],
      limit: 10,
    });
    expect(browsed.listings).toMatchObject([
      { version: "1.1.0", integrations: ["Stripe", "Slack"] },
    ]);
  });

  test("runs every statement on an empty database", async () => {
    await runMigration(addChips);

    await expect(runMigration(copy)).resolves.toHaveLength(
      migration(copy).queries.length,
    );
  });
});
