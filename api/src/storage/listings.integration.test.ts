import { env } from "cloudflare:workers";
import { describe, expect, inject, test } from "vitest";
import {
  readAllRows,
  seedAccount,
  seedDeprecation,
  seedDescription,
  seedVersion,
} from "./seed";
import { readChips } from "./migration-testing";
import { Storage, type NewListing } from "./storage";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

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
  ...listing,
});

describe("creating a listing", () => {
  test("reads back by address with every search field", async () => {
    const listing = await newListing({
      sdk: "TypeScript",
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
      publishedAt: expect.any(Date) as Date,
    });
    // published_at is stored in whole seconds.
    expect(found?.publishedAt.getTime()).toBeGreaterThanOrEqual(
      Math.floor(before / 1000) * 1000,
    );
    expect(found?.publishedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("stores the description on the first version, not the listing, and gives the listing no chips", async () => {
    const listing = await newListing();

    await storage().createListing(listing);

    const { listings, versions } = await readAllRows(env.DB);
    const isListing = (row: unknown) => {
      const { handle, name } = row as Record<string, string>;
      return handle === listing.handle && name === listing.name;
    };
    expect(listings?.filter(isListing)).toEqual([
      {
        handle: listing.handle,
        name: listing.name,
        removedBy: null,
        chips: [],
      },
    ]);
    expect(versions?.filter(isListing)).toEqual([
      expect.objectContaining({
        version: "1.0.0",
        description: "Posts a message to a Slack channel.",
      }),
    ]);
  });

  test("returns the created listing as it reads back", async () => {
    const listing = await newListing({ sdk: ".NET" });

    const result = await storage().createListing(listing);

    expect(result).toEqual({
      outcome: "created",
      listing: await storage().findListing(listing),
    });
  });

  test("gives the listing no chips", async () => {
    const listing = await newListing();

    await storage().createListing(listing);

    expect(await readChips(listing)).toEqual([]);
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

describe("finding a version", () => {
  test("returns the version's own fields, without the description", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    expect(await storage().findVersion(listing)).toEqual({
      handle: listing.handle,
      name: listing.name,
      version: "1.0.0",
      title: "Post slack message",
      sdk: "Python",
      publishedAt: expect.any(Date) as Date,
    });
  });

  test("returns nothing for an unknown version of a known listing", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    expect(
      await storage().findVersion({ ...listing, version: "1.0.1" }),
    ).toBeUndefined();
  });

  test("returns nothing for a wrong-case handle or name", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    expect(
      await storage().findVersion({
        ...listing,
        handle: listing.handle.toUpperCase(),
      }),
    ).toBeUndefined();
    expect(
      await storage().findVersion({
        ...listing,
        name: listing.name.toUpperCase(),
      }),
    ).toBeUndefined();
  });

  test("is unchanged when the version's description changes", async () => {
    const listing = await newListing();
    await storage().createListing(listing);
    const before = await storage().findVersion(listing);

    await seedDescription(env.DB, { ...listing, description: "Changed." });

    expect(await storage().findVersion(listing)).toEqual(before);
  });
});

/** Adds a version under a stored listing, with its own description and history. */
const addVersion = (
  listing: NewListing,
  version: string,
  fields: {
    description?: string;
    whatChanged?: string | null;
    basedOn?: string | null;
    publishedAt?: Date;
  } = {},
) =>
  seedVersion(env.DB, {
    handle: listing.handle,
    name: listing.name,
    version,
    title: listing.title,
    sdk: listing.sdk,
    ...fields,
  });

describe("finding a listing's versions", () => {
  test("returns every version newest first, each with its own description, note, base and deprecation", async () => {
    const listing = await newListing();
    await storage().createListing(listing);
    await addVersion(listing, "1.1.0", {
      description: "Posts a message and returns its timestamp.",
      whatChanged: "Returns the message timestamp.",
      basedOn: "1.0.0",
      publishedAt: new Date("2026-11-01T09:00:00Z"),
    });
    await addVersion(listing, "1.10.0", {
      description: "Posts a message or a thread reply.",
      whatChanged: "Replies in threads.",
      basedOn: "1.1.0",
      publishedAt: new Date("2026-11-10T09:00:00Z"),
    });
    await seedDeprecation(env.DB, {
      ...listing,
      version: "1.0.0",
      reason: "Drops messages over 4,000 characters.",
      replacement: "1.10.0",
    });
    await seedDeprecation(env.DB, {
      ...listing,
      version: "1.1.0",
      reason: "Uses a retired Slack API.",
    });

    const found = await storage().findListingVersions(listing);

    expect(found).toEqual({
      handle: listing.handle,
      name: listing.name,
      removedBy: null,
      versions: [
        {
          version: "1.10.0",
          publishedAt: new Date("2026-11-10T09:00:00Z"),
          whatChanged: "Replies in threads.",
          basedOn: "1.1.0",
          deprecation: null,
          description: "Posts a message or a thread reply.",
        },
        {
          version: "1.1.0",
          publishedAt: new Date("2026-11-01T09:00:00Z"),
          whatChanged: "Returns the message timestamp.",
          basedOn: "1.0.0",
          deprecation: {
            reason: "Uses a retired Slack API.",
            replacement: null,
          },
          description: "Posts a message and returns its timestamp.",
        },
        {
          version: "1.0.0",
          publishedAt: expect.any(Date) as Date,
          whatChanged: null,
          basedOn: null,
          deprecation: {
            reason: "Drops messages over 4,000 characters.",
            replacement: "1.10.0",
          },
          description: "Posts a message to a Slack channel.",
        },
      ],
    });
  });

  test("returns a one-item list for a listing with one version", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    expect(await storage().findListingVersions(listing)).toEqual({
      handle: listing.handle,
      name: listing.name,
      removedBy: null,
      versions: [
        {
          version: "1.0.0",
          publishedAt: expect.any(Date) as Date,
          whatChanged: null,
          basedOn: null,
          deprecation: null,
          description: "Posts a message to a Slack channel.",
        },
      ],
    });
  });

  test("returns a version's new description once it changes", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    await seedDescription(env.DB, { ...listing, description: "Changed." });

    expect(
      (await storage().findListingVersions(listing))?.versions[0],
    ).toMatchObject({ description: "Changed." });
  });

  test("returns only the listing's own versions", async () => {
    const listing = await newListing();
    const sibling = await newListing({ handle: listing.handle });
    const sameName = await newListing({ name: listing.name });
    for (const each of [listing, sibling, sameName]) {
      await storage().createListing(each);
    }
    await addVersion(sibling, "2.0.0");

    expect(
      (await storage().findListingVersions(listing))?.versions.map(
        ({ version }) => version,
      ),
    ).toEqual(["1.0.0"]);
  });

  test("returns nothing for an unknown or wrong-case listing", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    for (const address of [
      { handle: listing.handle, name: "never-published" },
      { handle: listing.handle.toUpperCase(), name: listing.name },
      { handle: listing.handle, name: listing.name.toUpperCase() },
    ]) {
      expect(await storage().findListingVersions(address)).toBeUndefined();
    }
  });
});

describe("changing a version's description", () => {
  test("changes that version's description and reports it", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    const changed = await storage().updateVersionDescription({
      ...listing,
      description: "Posts a message and returns its timestamp.",
    });

    expect(changed).toBe(true);
    expect(await storage().findListing(listing)).toMatchObject({
      description: "Posts a message and returns its timestamp.",
    });
  });

  test("changes only the named version, and no other row of any table", async () => {
    const listing = await newListing();
    await storage().createListing(listing);
    await addVersion(listing, "1.1.0", { description: "Version 1.1.0's own." });
    await addVersion(listing, "2.0.0", { description: "Version 2.0.0's own." });
    const sibling = await newListing({ handle: listing.handle });
    const sameName = await newListing({ name: listing.name });
    for (const each of [sibling, sameName]) {
      await storage().createListing(each);
    }
    const before = await readAllRows(env.DB);
    const isChanged = (row: unknown) => {
      const { handle, name, version } = row as Record<string, string>;
      return (
        handle === listing.handle &&
        name === listing.name &&
        version === "1.1.0"
      );
    };

    await storage().updateVersionDescription({
      ...listing,
      version: "1.1.0",
      description: "Posts a message and returns its timestamp.",
    });

    const after = await readAllRows(env.DB);
    expect(after["versions"]?.filter((row) => !isChanged(row))).toEqual(
      before["versions"]?.filter((row) => !isChanged(row)),
    );
    const changedBefore = before["versions"]?.find(isChanged) as object;
    expect(after["versions"]?.filter(isChanged)).toEqual([
      {
        ...changedBefore,
        description: "Posts a message and returns its timestamp.",
      },
    ]);
    for (const table of Object.keys(before).filter((t) => t !== "versions")) {
      expect(after[table]).toEqual(before[table]);
    }
  });

  test("reports no change and writes nothing for an unknown, wrong-case or other listing's version", async () => {
    const listing = await newListing();
    await storage().createListing(listing);
    const other = await newListing({ handle: listing.handle });
    await storage().createListing(other);
    await addVersion(other, "1.1.0");
    const before = await readAllRows(env.DB);

    for (const address of [
      { ...listing, version: "9.9.9" },
      { ...listing, version: "1.1.0" },
      { ...listing, handle: listing.handle.toUpperCase() },
      { ...listing, name: listing.name.toUpperCase() },
      { ...listing, name: "no-such-activity" },
    ]) {
      expect(
        await storage().updateVersionDescription({
          ...address,
          description: "Posts a message and returns its timestamp.",
        }),
      ).toBe(false);
    }
    expect(await readAllRows(env.DB)).toEqual(before);
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
      description: "Posts a message and returns its timestamp.",
    });

    expect(await storage().findListing(listing)).toMatchObject({
      version: "1.0.0",
      title: "Post slack message",
      description: listing.description,
    });
    expect(
      await storage().findListing({ ...listing, version: "1.1.0" }),
    ).toMatchObject({
      version: "1.1.0",
      title: "Post slack message v1.1",
      description: "Posts a message and returns its timestamp.",
    });
  });

  test("reject an SDK Durables does not accept", async () => {
    const listing = await newListing();
    await storage().createListing(listing);

    await expect(
      env.DB.prepare(
        "insert into versions (handle, name, version, title, sdk) values (?, ?, ?, ?, ?)",
      )
        .bind(listing.handle, listing.name, "9.0.0", "Title", "Kotlin")
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
      "removed_by",
      "chips",
    ]);
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
});
