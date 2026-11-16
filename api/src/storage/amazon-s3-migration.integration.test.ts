import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { runMigration, storedListing } from "./migration-testing";
import { readAllRows } from "./seed";
import { Storage, type NewListing } from "./storage";

// Migration 0002 renames the integration "AWS S3" to "Amazon S3" in stored version rows. The
// setup file has already applied it to an empty table, so each test writes rows the old way
// and runs the migration's own statements again.

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** Runs migration 0002 and returns how many rows each statement changed. */
const migrate = () => runMigration("0002_amazon-s3-integration-name");

/** The integrations column exactly as stored. */
const storedText = async ({ handle, name }: NewListing) =>
  (
    await env.DB.prepare(
      "select integrations from versions where handle = ? and name = ?",
    )
      .bind(handle, name)
      .first<{ integrations: string }>()
  )?.integrations;

describe("migration 0002, Amazon S3", () => {
  test("renames AWS S3 to Amazon S3", async () => {
    const listing = await storedListing({ integrations: ["AWS S3"] });

    await migrate();

    expect((await storage().findListing(listing))?.integrations).toEqual([
      "Amazon S3",
    ]);
  });

  test("keeps the other integrations, in their places, in a mixed list", async () => {
    const listing = await storedListing({
      integrations: ["AWS S3", "Postgres", "Stripe"],
    });

    await migrate();

    expect((await storage().findListing(listing))?.integrations).toEqual([
      "Amazon S3",
      "Postgres",
      "Stripe",
    ]);
  });

  test("stores the renamed list as publishing stores a list", async () => {
    const listing = await storedListing({
      integrations: ["Postgres", "AWS S3"],
    });

    await migrate();

    expect(await storedText(listing)).toBe(
      JSON.stringify(["Postgres", "Amazon S3"]),
    );
  });

  test("leaves a listing with no integrations untouched", async () => {
    const listing = await storedListing();

    await migrate();

    expect(await storedText(listing)).toBe("[]");
  });

  test("leaves a listing without AWS S3 untouched", async () => {
    const listing = await storedListing({ integrations: ["Slack", "Stripe"] });

    await migrate();

    expect(await storedText(listing)).toBe(JSON.stringify(["Slack", "Stripe"]));
  });

  test("changes no row when it runs again on migrated data", async () => {
    await storedListing({ integrations: ["AWS S3", "Slack"] });
    await storedListing();
    expect((await migrate()).reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
    const migrated = await readAllRows(env.DB);

    const changes = await migrate();

    expect(changes.every((n) => n === 0)).toBe(true);
    expect(await readAllRows(env.DB)).toEqual(migrated);
  });
});
