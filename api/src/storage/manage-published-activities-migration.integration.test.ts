import { env } from "cloudflare:workers";
import { SQLiteSyncDialect, getTableConfig } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, test } from "vitest";
import {
  insertEarlyListing,
  insertEarlyVersion,
  migration,
  readTables,
  rebuildDatabaseBefore,
  runMigration,
} from "./migration-testing";
import { listings, versionDeprecations } from "./schema";
import { readAllRows } from "./seed";
import { Storage, type VersionDocument } from "./storage";

// Migration 0004 adds the storage for managing published activities (ADR 0015). The setup file
// has already applied it to an empty database, so each test puts the database back as it was
// just before migration 0004, writes rows the old way, and runs the migration's own statements
// again. Storage is isolated per test, so dropping tables here touches no other test.

const manage = "0004_manage-published-activities";

/** Runs migration 0004, as Wrangler runs a migration file. */
const migrate = () => runMigration(manage);

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** The column names of a table, as SQLite reports them. */
const columnNames = async (table: string) =>
  (
    await env.DB.prepare(`pragma table_xinfo(${table})`).all<{
      name: string;
    }>()
  ).results.map(({ name }) => name);

/** One column of the version at an address, exactly as stored. */
const versionColumn = async <T>(
  column: string,
  { handle, name, version }: { handle: string; name: string; version: string },
) =>
  (
    await env.DB.prepare(
      `select ${column} as value from versions where handle = ? and name = ? and version = ?`,
    )
      .bind(handle, name, version)
      .first<{ value: T }>()
  )?.value;

/** The SQL SQLite stored for a table. */
const tableSql = async (table: string) =>
  (
    await env.DB.prepare(
      "select sql from sqlite_master where type = 'table' and name = ?",
    )
      .bind(table)
      .first<{ sql: string }>()
  )?.sql;

/** A check the storage schema declares, as SQL. */
const declaredCheck = (
  table: typeof listings | typeof versionDeprecations,
  name: string,
) => {
  const check = getTableConfig(table).checks.find((c) => c.name === name);
  if (check === undefined) {
    throw new Error(`The storage schema has no ${name} check.`);
  }
  return new SQLiteSyncDialect().sqlToQuery(check.value).sql;
};

const documentFor = (description: string): VersionDocument => ({
  code: "from temporalio import activity\n\n\n@activity.defn\nasync def upload_report(request: UploadRequest) -> UploadResult:\n    return await upload(request)\n",
  facts: {
    sdk: "Python",
    activity: { name: "upload_report", line: 5 },
    input: "UploadRequest",
    output: "UploadResult",
    runsAs: "async",
    nonRetryableErrors: [],
    configurationRead: [],
    dependencies: [],
    heartbeats: [],
  },
  integrations: [],
  snippets: [
    {
      label: "Register",
      code: "worker = Worker(activities=[upload_report])\n",
    },
  ],
  title: "Upload report",
  description,
});

describe("migration 0004, storage for managing published activities", () => {
  beforeEach(async () => {
    await rebuildDatabaseBefore(manage);
  });

  test("starts from a database with none of its columns or tables", async () => {
    expect(await columnNames("versions")).not.toContain("description");
    expect(await columnNames("listings")).not.toContain("removed_by");
    expect(await columnNames("accounts")).not.toContain(
      "deletion_requested_at",
    );
    expect(await tableSql("version_deprecations")).toBeUndefined();
  });

  describe("copying descriptions to versions", () => {
    test("gives each listing's version that listing's description", async () => {
      const upload = await insertEarlyListing({
        description: "Uploads a CSV report and returns where it is.",
      });
      const charge = await insertEarlyListing({
        description: "Charges a card and returns the receipt.",
      });

      await migrate();

      expect(await versionColumn("description", upload)).toBe(
        upload.description,
      );
      expect(await versionColumn("description", charge)).toBe(
        charge.description,
      );
    });

    test("leaves each listing's own description unchanged", async () => {
      const upload = await insertEarlyListing();
      const charge = await insertEarlyListing({
        description: "Charges a card and returns the receipt.",
      });
      const before = await readTables("listings");

      await migrate();

      const after = await env.DB.prepare(
        "select handle, name, description from listings",
      ).all();
      expect(after.results).toEqual(before["listings"]);
      expect(after.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ description: upload.description }),
          expect.objectContaining({ description: charge.description }),
        ]),
      );
    });

    test("copies an empty description as an empty description", async () => {
      const listing = await insertEarlyListing({ description: "" });

      await migrate();

      expect(await versionColumn("description", listing)).toBe("");
    });

    test("copies a description with quotes and non-ASCII text exactly", async () => {
      const listing = await insertEarlyListing({
        description: `Sends a "receipt" to the café's printer — once.`,
      });

      await migrate();

      expect(await versionColumn("description", listing)).toBe(
        listing.description,
      );
    });
  });

  describe("on an empty database", () => {
    test("runs every statement without error", async () => {
      await expect(migrate()).resolves.toHaveLength(
        migration(manage).queries.length,
      );
    });

    test("leaves every table empty and readable through the storage schema", async () => {
      await migrate();

      expect(await readAllRows(env.DB)).toEqual({
        accounts: [],
        providerAccounts: [],
        handles: [],
        retiredHandles: [],
        listings: [],
        versions: [],
        versionDeprecations: [],
      });
    });
  });

  describe("existing versions", () => {
    test("keep their number, title, SDK, integrations and published date", async () => {
      const listing = await insertEarlyListing({
        sdk: "TypeScript",
        integrations: ["Slack", "Stripe"],
      });
      await insertEarlyListing({ sdk: ".NET", version: "2.3.10" });
      const columns =
        "handle, name, version, title, sdk, integrations, published_at";
      const read = async () =>
        (
          await env.DB.prepare(
            `select ${columns} from versions order by handle`,
          ).all()
        ).results;
      const before = await read();

      await migrate();

      expect(await read()).toEqual(before);
      expect(await storage().findVersion(listing)).toEqual({
        handle: listing.handle,
        name: listing.name,
        version: "1.0.0",
        title: listing.title,
        sdk: "TypeScript",
        integrations: ["Slack", "Stripe"],
        publishedAt: listing.publishedAt,
      });
    });

    test("keep their published code", async () => {
      const listing = await insertEarlyListing();
      const document = documentFor(listing.description);
      await storage().writeVersionDocument(listing, document);

      await migrate();

      expect(await storage().readVersionDocument(listing)).toEqual(document);
    });

    test("have no What changed note and no base version", async () => {
      const listing = await insertEarlyListing();

      await migrate();

      expect(await versionColumn("what_changed", listing)).toBeNull();
      expect(await versionColumn("based_on", listing)).toBeNull();
    });

    test("have no deprecation", async () => {
      await insertEarlyListing();

      await migrate();

      expect(await readTables("version_deprecations")).toEqual({
        version_deprecations: [],
      });
    });
  });

  test("leaves every existing listing in search", async () => {
    await insertEarlyListing();
    await insertEarlyListing();

    await migrate();

    const removed = await env.DB.prepare(
      "select count(*) as n from listings where removed_by is not null",
    ).first<{ n: number }>();
    expect(removed?.n).toBe(0);
  });

  describe("existing accounts", () => {
    test("are not pending deletion", async () => {
      await insertEarlyListing();
      await insertEarlyListing();

      await migrate();

      const { accounts } = await readAllRows(env.DB);
      expect(accounts).toHaveLength(2);
      for (const account of accounts ?? []) {
        expect(account).toMatchObject({ deletionRequestedAt: null });
      }
    });

    test("keep their ID and created date", async () => {
      await insertEarlyListing();
      const before = await readTables("accounts");

      await migrate();

      const after = await env.DB.prepare(
        "select id, created_at from accounts",
      ).all();
      expect(after.results).toEqual(before["accounts"]);
    });
  });

  test("keeps every version joined to its listing", async () => {
    const listing = await insertEarlyListing();
    await insertEarlyVersion(listing, { version: "1.1.0" });

    await migrate();

    expect(
      (await env.DB.prepare("pragma foreign_key_check").all()).results,
    ).toEqual([]);
  });

  test("leaves the tables with the checks the storage schema declares", async () => {
    await migrate();

    expect(await tableSql("listings")).toContain(
      `CONSTRAINT "listings_removed_by" CHECK(${declaredCheck(listings, "listings_removed_by")})`,
    );
    expect(await tableSql("version_deprecations")).toContain(
      `CONSTRAINT "version_deprecations_replacement" CHECK(${declaredCheck(versionDeprecations, "version_deprecations_replacement")})`,
    );
  });
});
