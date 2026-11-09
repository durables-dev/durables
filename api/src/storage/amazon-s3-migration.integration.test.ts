import { env } from "cloudflare:workers";
import { describe, expect, inject, test } from "vitest";
import { readAllRows, seedAccount } from "./seed";
import { Storage, type NewListing } from "./storage";

// Migration 0002 renames the integration "AWS S3" to "Amazon S3" in stored version rows. The
// setup file has already applied it to an empty table, so each test writes rows the old way
// and runs the migration's own statements again.

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const migration = () => {
  const found = inject("d1Migrations").find(({ name }) =>
    name.startsWith("0002_amazon-s3-integration-name"),
  );
  if (found === undefined) {
    throw new Error("Migration 0002_amazon-s3-integration-name is missing.");
  }
  return found;
};

/** Runs the migration's statements and returns how many rows each one changed. */
const runMigration = async (): Promise<number[]> => {
  const results = await env.DB.batch(
    migration().queries.map((query) => env.DB.prepare(query)),
  );
  return results.map(({ meta }) => meta.changes);
};

/** A listing stored with the given integrations, under a name no other test uses. */
const storedListing = async (integrations: string[]): Promise<NewListing> => {
  const listing: NewListing = {
    handle: (await seedAccount(env.DB)).handle,
    name: `activity-${crypto.randomUUID().slice(0, 8)}`,
    version: "1.0.0",
    title: "Upload report",
    description: "Uploads a CSV report and returns where it is.",
    sdk: "Python",
    integrations,
  };
  await storage().createListing(listing);
  return listing;
};

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
    const listing = await storedListing(["AWS S3"]);

    await runMigration();

    expect((await storage().findListing(listing))?.integrations).toEqual([
      "Amazon S3",
    ]);
  });

  test("keeps the other integrations, in their places, in a mixed list", async () => {
    const listing = await storedListing(["AWS S3", "Postgres", "Stripe"]);

    await runMigration();

    expect((await storage().findListing(listing))?.integrations).toEqual([
      "Amazon S3",
      "Postgres",
      "Stripe",
    ]);
  });

  test("stores the renamed list as publishing stores a list", async () => {
    const listing = await storedListing(["Postgres", "AWS S3"]);

    await runMigration();

    expect(await storedText(listing)).toBe(
      JSON.stringify(["Postgres", "Amazon S3"]),
    );
  });

  test("leaves a listing with no integrations untouched", async () => {
    const listing = await storedListing([]);

    await runMigration();

    expect(await storedText(listing)).toBe("[]");
  });

  test("leaves a listing without AWS S3 untouched", async () => {
    const listing = await storedListing(["Slack", "Stripe"]);

    await runMigration();

    expect(await storedText(listing)).toBe(JSON.stringify(["Slack", "Stripe"]));
  });

  test("changes no row when it runs again on migrated data", async () => {
    await storedListing(["AWS S3", "Slack"]);
    await storedListing([]);
    expect(
      (await runMigration()).reduce((sum, n) => sum + n, 0),
    ).toBeGreaterThan(0);
    const migrated = await readAllRows(env.DB);

    const changes = await runMigration();

    expect(changes.every((n) => n === 0)).toBe(true);
    expect(await readAllRows(env.DB)).toEqual(migrated);
  });
});
