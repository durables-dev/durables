import { env } from "cloudflare:workers";
import { describe, expect, inject, test } from "vitest";
import { readAllRows, seedAccount, seedVersion } from "./seed";
import { Storage, type NewListing } from "./storage";

const storage = () => new Storage(env.DB);

/** A listing at a handle that exists, with a name no other test uses. */
const newListing = async (
  listing: Partial<NewListing> = {},
): Promise<NewListing> => ({
  handle: listing.handle ?? (await seedAccount(env.DB)).handle,
  name: `activity-${crypto.randomUUID().slice(0, 8)}`,
  version: "1.0.0",
  title: "Post slack message",
  description: "Posts a message to a Slack channel.",
  sdk: "Python",
  integrations: ["Slack"],
  ...listing,
});

describe("creating a listing", () => {
  test("reads back by address with every search field", async () => {
    const listing = await newListing({
      sdk: "TypeScript",
      integrations: ["Stripe", "Postgres"],
    });
    const before = Date.now();

    const result = await storage().createListing(listing);

    expect(result.outcome).toBe("created");
    const found = await storage().findListing(listing);
    expect(found).toEqual({
      handle: listing.handle,
      name: listing.name,
      version: "1.0.0",
      title: "Post slack message",
      description: "Posts a message to a Slack channel.",
      sdk: "TypeScript",
      integrations: ["Stripe", "Postgres"],
      publishedAt: expect.any(Date) as Date,
    });
    // published_at is stored in whole seconds.
    expect(found?.publishedAt.getTime()).toBeGreaterThanOrEqual(
      Math.floor(before / 1000) * 1000,
    );
    expect(found?.publishedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("returns the created listing as it reads back", async () => {
    const listing = await newListing({ sdk: ".NET" });

    const result = await storage().createListing(listing);

    expect(result).toEqual({
      outcome: "created",
      listing: await storage().findListing(listing),
    });
  });

  test("reads back an empty integrations list as empty", async () => {
    const listing = await newListing({ integrations: [] });

    await storage().createListing(listing);

    expect((await storage().findListing(listing))?.integrations).toEqual([]);
  });

  test("allows the same name under another publisher's handle", async () => {
    const first = await newListing({ description: "The first publisher's." });
    const second = await newListing({
      name: first.name,
      description: "The second publisher's.",
      sdk: ".NET",
    });
    await storage().createListing(first);

    const result = await storage().createListing(second);

    expect(result.outcome).toBe("created");
    expect(await storage().findListing(first)).toMatchObject({
      handle: first.handle,
      description: "The first publisher's.",
      sdk: "Python",
    });
    expect(await storage().findListing(second)).toMatchObject({
      handle: second.handle,
      description: "The second publisher's.",
      sdk: ".NET",
    });
  });
});

describe("creating a listing at an address that exists", () => {
  test("fails with address-taken and changes nothing", async () => {
    const listing = await newListing();
    await storage().createListing(listing);
    const first = await storage().findListing(listing);
    const rowsBefore = await readAllRows(env.DB);

    const result = await storage().createListing({
      ...listing,
      title: "Another title",
      description: "Another description.",
      sdk: "TypeScript",
      integrations: [],
    });

    expect(result).toEqual({ outcome: "address-taken" });
    expect(await storage().findListing(listing)).toEqual(first);
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("fails with address-taken for a new version of an existing listing", async () => {
    const listing = await newListing();
    await storage().createListing(listing);
    const rowsBefore = await readAllRows(env.DB);

    const result = await storage().createListing({
      ...listing,
      version: "2.0.0",
      description: "Another description.",
    });

    expect(result).toEqual({ outcome: "address-taken" });
    expect(
      await storage().findListing({ ...listing, version: "2.0.0" }),
    ).toBeUndefined();
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("raises other database failures rather than reporting address-taken", async () => {
    const listing = await newListing({
      handle: `no-account-${crypto.randomUUID().slice(0, 8)}`,
    });

    await expect(storage().createListing(listing)).rejects.toThrow();
    expect(await storage().findListing(listing)).toBeUndefined();
  });
});

describe("finding a listing", () => {
  test("returns nothing for an unknown address", async () => {
    const { handle } = await seedAccount(env.DB);

    expect(
      await storage().findListing({
        handle,
        name: "never-published",
        version: "1.0.0",
      }),
    ).toBeUndefined();
  });

  test("returns nothing for an unknown version of a known listing", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    expect(
      await storage().findListing({ ...listing, version: "1.0.1" }),
    ).toBeUndefined();
  });
});

describe("the listing and version tables", () => {
  test("accept a second version under an existing listing", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    await seedVersion(env.DB, {
      handle: listing.handle,
      name: listing.name,
      version: "1.1.0",
      title: "Post slack message v1.1",
      sdk: "Python",
      integrations: [],
    });

    expect(await storage().findListing(listing)).toMatchObject({
      version: "1.0.0",
      title: "Post slack message",
    });
    expect(
      await storage().findListing({ ...listing, version: "1.1.0" }),
    ).toMatchObject({
      version: "1.1.0",
      title: "Post slack message v1.1",
      description: listing.description,
      integrations: [],
    });
  });

  test("reject an SDK Durables does not accept", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    await expect(
      env.DB.prepare(
        "insert into versions (handle, name, version, title, sdk, integrations) values (?, ?, ?, ?, ?, ?)",
      )
        .bind(listing.handle, listing.name, "9.0.0", "Title", "Java", "[]")
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  test("reject a version with no listing", async () => {
    const { handle } = await seedAccount(env.DB);

    await expect(
      seedVersion(env.DB, {
        handle,
        name: "no-listing",
        version: "1.0.0",
        title: "Title",
        sdk: "Python",
        integrations: [],
      }),
    ).rejects.toThrow();
  });
});

describe("the migrations", () => {
  // The test database starts empty, and the setup file applies every migration to it
  // before this file runs (apply-migrations.setup.ts).
  test("all apply to the empty test database", async () => {
    const applied = await env.DB.prepare(
      "select name from d1_migrations order by id",
    ).all<{ name: string }>();

    expect(applied.results.map(({ name }) => name)).toEqual(
      inject("d1Migrations").map(({ name }) => name),
    );
    expect(applied.results.map(({ name }) => name)).toContain(
      "0001_listings-and-versions.sql",
    );
  });

  test("create the listing and version columns search reads", async () => {
    const columns = async (table: string) =>
      (
        await env.DB.prepare(
          `select name from pragma_table_info('${table}')`,
        ).all<{ name: string }>()
      ).results.map(({ name }) => name);

    expect(await columns("listings")).toEqual([
      "handle",
      "name",
      "description",
    ]);
    expect(await columns("versions")).toEqual([
      "handle",
      "name",
      "version",
      "title",
      "sdk",
      "integrations",
      "published_at",
    ]);
  });
});
