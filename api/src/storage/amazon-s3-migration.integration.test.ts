import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";
import {
  insertEarlyListing,
  readTables,
  rebuildDatabaseBefore,
  runMigration,
} from "./migration-testing";

// Migration 0002 renames the integration "AWS S3" to "Amazon S3" in stored version rows. The
// setup file has already applied it to an empty table, so each test puts the database back as
// it was just before migration 0002, writes rows the old way, and runs the migration's own
// statements again. Migration 0009 drops the versions' integrations column, so the rows are
// written and read with plain SQL in the columns of that time. Storage is isolated per test, so
// dropping tables here touches no other test.

const rename = "0002_amazon-s3-integration-name";

/** Runs migration 0002 and returns how many rows each statement changed. */
const migrate = () => runMigration(rename);

/** The integrations column exactly as stored. */
const storedText = async ({ handle, name }: { handle: string; name: string }) =>
  (
    await env.DB.prepare(
      "select integrations from versions where handle = ? and name = ?",
    )
      .bind(handle, name)
      .first<{ integrations: string }>()
  )?.integrations;

/** The integrations column, read as the list it holds. */
const storedIntegrations = async (listing: { handle: string; name: string }) =>
  JSON.parse((await storedText(listing)) ?? "null") as unknown;

/** Every table that exists before migration 0002. */
const tables = [
  "accounts",
  "provider_accounts",
  "handles",
  "retired_handles",
  "listings",
  "versions",
];

describe("migration 0002, Amazon S3", () => {
  beforeEach(async () => {
    await rebuildDatabaseBefore(rename);
  });

  test("renames AWS S3 to Amazon S3", async () => {
    const listing = await insertEarlyListing({ integrations: ["AWS S3"] });

    await migrate();

    expect(await storedIntegrations(listing)).toEqual(["Amazon S3"]);
  });

  test("keeps the other integrations, in their places, in a mixed list", async () => {
    const listing = await insertEarlyListing({
      integrations: ["AWS S3", "Postgres", "Stripe"],
    });

    await migrate();

    expect(await storedIntegrations(listing)).toEqual([
      "Amazon S3",
      "Postgres",
      "Stripe",
    ]);
  });

  test("stores the renamed list as publishing stores a list", async () => {
    const listing = await insertEarlyListing({
      integrations: ["Postgres", "AWS S3"],
    });

    await migrate();

    expect(await storedText(listing)).toBe(
      JSON.stringify(["Postgres", "Amazon S3"]),
    );
  });

  test("leaves a listing with no integrations untouched", async () => {
    const listing = await insertEarlyListing();

    await migrate();

    expect(await storedText(listing)).toBe("[]");
  });

  test("leaves a listing without AWS S3 untouched", async () => {
    const listing = await insertEarlyListing({
      integrations: ["Slack", "Stripe"],
    });

    await migrate();

    expect(await storedText(listing)).toBe(JSON.stringify(["Slack", "Stripe"]));
  });

  test("changes no row when it runs again on migrated data", async () => {
    await insertEarlyListing({ integrations: ["AWS S3", "Slack"] });
    await insertEarlyListing();
    expect((await migrate()).reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
    const migrated = await readTables(...tables);

    const changes = await migrate();

    expect(changes.every((n) => n === 0)).toBe(true);
    expect(await readTables(...tables)).toEqual(migrated);
  });
});
