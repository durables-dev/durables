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
  runMigrationsAfter,
} from "./migration-testing";
import { storedSdks, versions } from "./schema";
import { Storage } from "./storage";

// Migration 0003 rebuilds the versions table to widen its versions_sdk check. The setup file
// has already applied it to an empty table, so each test puts the database back as it was just
// before migration 0003, with the versions table exactly as migration 0001 created it, writes
// rows the old way, and runs the migration's own statements again. Storage is isolated per
// test, so dropping tables here touches no other test.

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const widen = "0003_widen-versions-sdk";

/** Runs migration 0003, as Wrangler runs a migration file. */
const migrate = () => runMigration(widen);

/** Writes a version row directly, with any SDK text, under the given listing. */
const insertVersion = (
  { handle, name }: { handle: string; name: string },
  version: string,
  sdk: string,
) =>
  env.DB.prepare(
    "insert into versions (handle, name, version, title, sdk, integrations) values (?, ?, ?, ?, ?, ?)",
  )
    .bind(handle, name, version, "Upload report", sdk, "[]")
    .run();

/** The versions table's columns, keys and indexes, as SQLite reports them. */
const tableShape = async () => {
  const pragma = async (statement: string) =>
    (await env.DB.prepare(statement).all()).results;
  const indexes = await pragma("pragma index_list(versions)");
  return {
    columns: await pragma("pragma table_xinfo(versions)"),
    foreignKeys: await pragma("pragma foreign_key_list(versions)"),
    indexes,
    indexColumns: await Promise.all(
      indexes.map(({ name }) =>
        pragma(`pragma index_xinfo(${JSON.stringify(name)})`),
      ),
    ),
  };
};

/** The SQL SQLite stored for the versions table. */
const versionsTableSql = async () =>
  (
    await env.DB.prepare(
      "select sql from sqlite_master where type = 'table' and name = 'versions'",
    ).first<{ sql: string }>()
  )?.sql;

describe("migration 0003, widen the versions table to every SDK", () => {
  beforeEach(async () => {
    await rebuildDatabaseBefore(widen);
  });

  test("starts from a table that refuses Go, as before the migration", async () => {
    const listing = await insertEarlyListing();

    await expect(insertVersion(listing, "2.0.0", "Go")).rejects.toThrow(
      /CHECK constraint failed: versions_sdk/,
    );
  });

  test("keeps every existing row and its listing reference unchanged", async () => {
    const python = await insertEarlyListing({
      integrations: ["Amazon S3", "Postgres"],
    });
    const typescript = await insertEarlyListing({
      sdk: "TypeScript",
      integrations: ["Slack"],
    });
    await insertEarlyListing({ sdk: ".NET" });
    await insertEarlyVersion(python, {
      version: "1.1.0",
      title: "Upload report, retried",
      sdk: "Python",
      integrations: [],
      publishedAt: new Date("2026-10-01T12:00:00Z"),
    });
    const tables = [
      "accounts",
      "provider_accounts",
      "handles",
      "retired_handles",
      "listings",
      "versions",
    ];
    const before = await readTables(...tables);

    await migrate();

    expect(await readTables(...tables)).toEqual(before);
    // Storage reads the schema of today, so the later migrations run before it reads.
    await runMigrationsAfter(widen);
    expect(await storage().findListing(python)).toMatchObject({
      sdk: "Python",
      integrations: ["Amazon S3", "Postgres"],
      description: python.description,
    });
    expect(await storage().findListing(typescript)).toMatchObject({
      sdk: "TypeScript",
      integrations: ["Slack"],
    });
  });

  test("leaves every version joined to its listing", async () => {
    await insertEarlyListing();
    await insertEarlyListing({ sdk: ".NET" });

    await migrate();

    const unjoined = await env.DB.prepare(
      "select count(*) as n from versions v left join listings l on l.handle = v.handle and l.name = v.name where l.handle is null",
    ).first<{ n: number }>();
    expect(unjoined?.n).toBe(0);
    expect(
      (await env.DB.prepare("pragma foreign_key_check").all()).results,
    ).toEqual([]);
  });

  test.each(storedSdks)("accepts a version written in %s", async (sdk) => {
    const listing = await insertEarlyListing();
    await migrate();

    await insertVersion(listing, "2.0.0", sdk);

    const stored = await env.DB.prepare(
      "select sdk from versions where handle = ? and name = ? and version = '2.0.0'",
    )
      .bind(listing.handle, listing.name)
      .first<{ sdk: string }>();
    expect(stored?.sdk).toBe(sdk);
  });

  test.each(["Kotlin", "go", "", "Python "])(
    "rejects a version written in an SDK outside the list: %j",
    async (sdk) => {
      const listing = await insertEarlyListing();
      await migrate();

      await expect(insertVersion(listing, "2.0.0", sdk)).rejects.toThrow(
        /CHECK constraint failed: versions_sdk/,
      );
    },
  );

  test("defers foreign key checks before anything else", () => {
    const [first = ""] = migration(widen).queries;
    const statement = first
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim()
      .replace(/;$/, "");

    expect(statement).toBe("PRAGMA defer_foreign_keys = true");
  });

  test("runs with foreign keys enforced, dropping the old table without a reference failure", async () => {
    await insertEarlyListing();
    await insertEarlyListing({ sdk: "TypeScript" });
    const enforced = await env.DB.prepare("pragma foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(enforced?.foreign_keys).toBe(1);

    await expect(migrate()).resolves.toHaveLength(
      migration(widen).queries.length,
    );

    expect(await versionsTableSql()).toContain("Rust");
  });

  test("still refuses a version whose listing does not exist", async () => {
    const listing = await insertEarlyListing();
    await migrate();

    await expect(
      insertVersion(
        { handle: listing.handle, name: "no-such-listing" },
        "1.0.0",
        "Go",
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  test("keeps every column, default, key and index", async () => {
    const before = await tableShape();

    await migrate();

    expect(await tableShape()).toEqual(before);
  });

  test("still fills in the published date when a version is written without one", async () => {
    const listing = await insertEarlyListing();
    await migrate();
    const now = Math.floor(Date.now() / 1000);

    await insertVersion(listing, "2.0.0", "Ruby");

    const stored = await env.DB.prepare(
      "select published_at from versions where handle = ? and name = ? and version = '2.0.0'",
    )
      .bind(listing.handle, listing.name)
      .first<{ published_at: number }>();
    expect(stored?.published_at).toBeGreaterThanOrEqual(now - 60);
  });

  test("leaves the table with the check the storage schema declares", async () => {
    await migrate();

    const check = getTableConfig(versions).checks.find(
      ({ name }) => name === "versions_sdk",
    );
    if (check === undefined) {
      throw new Error("The storage schema has no versions_sdk check.");
    }
    const declared = new SQLiteSyncDialect().sqlToQuery(check.value).sql;
    expect(await versionsTableSql()).toContain(
      `CONSTRAINT "versions_sdk" CHECK(${declared})`,
    );
  });
});
