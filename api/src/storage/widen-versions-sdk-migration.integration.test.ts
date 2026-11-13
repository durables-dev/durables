import { env } from "cloudflare:workers";
import { SQLiteSyncDialect, getTableConfig } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, inject, test } from "vitest";
import { versions } from "./schema";
import { readAllRows, seedAccount, seedVersion } from "./seed";
import { Storage, type NewListing } from "./storage";

// Migration 0003 rebuilds the versions table to widen its versions_sdk check. The setup file
// has already applied it to an empty table, so each test puts back the table exactly as
// migration 0001 created it, writes rows the old way, and runs the migration's own statements
// again. Storage is isolated per test, so dropping the table here touches no other test.

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const eightSdks = [
  "Go",
  "Java",
  "Python",
  "TypeScript",
  ".NET",
  "Ruby",
  "PHP",
  "Rust",
] as const;

const migration = (prefix: string) => {
  const found = inject("d1Migrations").find(({ name }) =>
    name.startsWith(prefix),
  );
  if (found === undefined) {
    throw new Error(`Migration ${prefix} is missing.`);
  }
  return found;
};

/** Runs migration 0003's statements in one batch, as Wrangler runs a migration file. */
const runMigration = async (): Promise<void> => {
  await env.DB.batch(
    migration("0003_widen-versions-sdk").queries.map((query) =>
      env.DB.prepare(query),
    ),
  );
};

/** Replaces the versions table with the one migration 0001 created, with its narrow check. */
const restoreTableFrom0001 = async (): Promise<void> => {
  const createVersions = migration("0001_listings-and-versions").queries.find(
    (query) => query.includes("CREATE TABLE `versions`"),
  );
  if (createVersions === undefined) {
    throw new Error("Migration 0001 no longer creates the versions table.");
  }
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = true"),
    env.DB.prepare("DROP TABLE `versions`"),
    env.DB.prepare(createVersions),
  ]);
};

/** A listing and its first version, published the way publishing stores them. */
const storedListing = async (
  sdk: NewListing["sdk"],
  integrations: string[] = [],
): Promise<NewListing> => {
  const listing: NewListing = {
    handle: (await seedAccount(env.DB)).handle,
    name: `activity-${crypto.randomUUID().slice(0, 8)}`,
    version: "1.0.0",
    title: "Upload report",
    description: "Uploads a CSV report and returns where it is.",
    sdk,
    integrations,
  };
  await storage().createListing(listing);
  return listing;
};

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
const storedTableSql = async () =>
  (
    await env.DB.prepare(
      "select sql from sqlite_master where type = 'table' and name = 'versions'",
    ).first<{ sql: string }>()
  )?.sql;

describe("migration 0003, widen the versions table to every SDK", () => {
  beforeEach(async () => {
    await restoreTableFrom0001();
  });

  test("starts from a table that refuses Go, as before the migration", async () => {
    const listing = await storedListing("Python");

    await expect(insertVersion(listing, "2.0.0", "Go")).rejects.toThrow(
      /CHECK constraint failed: versions_sdk/,
    );
  });

  test("keeps every existing row and its listing reference unchanged", async () => {
    const python = await storedListing("Python", ["Amazon S3", "Postgres"]);
    const typescript = await storedListing("TypeScript", ["Slack"]);
    await storedListing(".NET");
    await seedVersion(env.DB, {
      handle: python.handle,
      name: python.name,
      version: "1.1.0",
      title: "Upload report, retried",
      sdk: "Python",
      integrations: [],
      publishedAt: new Date("2026-10-01T12:00:00Z"),
    });
    const before = await readAllRows(env.DB);

    await runMigration();

    expect(await readAllRows(env.DB)).toEqual(before);
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
    await storedListing("Python");
    await storedListing(".NET");

    await runMigration();

    const unjoined = await env.DB.prepare(
      "select count(*) as n from versions v left join listings l on l.handle = v.handle and l.name = v.name where l.handle is null",
    ).first<{ n: number }>();
    expect(unjoined?.n).toBe(0);
    expect(
      (await env.DB.prepare("pragma foreign_key_check").all()).results,
    ).toEqual([]);
  });

  test.each(eightSdks)("accepts a version written in %s", async (sdk) => {
    const listing = await storedListing("Python");
    await runMigration();

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
      const listing = await storedListing("Python");
      await runMigration();

      await expect(insertVersion(listing, "2.0.0", sdk)).rejects.toThrow(
        /CHECK constraint failed: versions_sdk/,
      );
    },
  );

  test("defers foreign key checks before anything else", () => {
    const [first = ""] = migration("0003_widen-versions-sdk").queries;
    const statement = first
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim()
      .replace(/;$/, "");

    expect(statement).toBe("PRAGMA defer_foreign_keys = true");
  });

  test("runs with foreign keys enforced, dropping the old table without a reference failure", async () => {
    await storedListing("Python");
    await storedListing("TypeScript");
    const enforced = await env.DB.prepare("pragma foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(enforced?.foreign_keys).toBe(1);

    await expect(runMigration()).resolves.toBeUndefined();

    expect(await storedTableSql()).toContain("Rust");
  });

  test("still refuses a version whose listing does not exist", async () => {
    const listing = await storedListing("Python");
    await runMigration();

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

    await runMigration();

    expect(await tableShape()).toEqual(before);
  });

  test("still fills in the published date when a version is written without one", async () => {
    const listing = await storedListing("Python");
    await runMigration();
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
    await runMigration();

    const check = getTableConfig(versions).checks.find(
      ({ name }) => name === "versions_sdk",
    );
    if (check === undefined) {
      throw new Error("The storage schema has no versions_sdk check.");
    }
    const declared = new SQLiteSyncDialect().sqlToQuery(check.value).sql;
    expect(await storedTableSql()).toContain(
      `CONSTRAINT "versions_sdk" CHECK(${declared})`,
    );
  });
});
