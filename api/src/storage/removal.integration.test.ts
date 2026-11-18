import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { readAllRows, seedAccount, seedRemoval } from "./seed";
import { removalSources, Storage, type ListingKey } from "./storage";

// Taking a listing out of search and returning it, against real local D1 (ADR 0015). Rows
// written by one test stay for the next, so each test writes listings under a handle of its own.

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** A listed listing with one version, under a handle no other test uses. */
const newListing = async (handle?: string): Promise<ListingKey> => {
  const listing = {
    handle: handle ?? (await seedAccount(env.DB)).handle,
    name: `activity-${crypto.randomUUID().slice(0, 8)}`,
  };
  await storage().createListing({
    ...listing,
    version: "1.0.0",
    title: "Charge card",
    description: "Charges a card through Stripe.",
    sdk: "Python",
    integrations: ["Stripe"],
  });
  return listing;
};

const removedBy = async (listing: ListingKey) =>
  (await storage().findListingVersions(listing))?.removedBy;

describe("taking a listing out of search", () => {
  test.each(removalSources)("records %s as the source", async (source) => {
    const listing = await newListing();

    await storage().removeFromSearch(listing, source);

    expect(await removedBy(listing)).toBe(source);
  });

  test.each(removalSources)(
    "keeps a removal by %s when the publisher removes it again",
    async (source) => {
      const listing = await newListing();
      await seedRemoval(env.DB, { ...listing, removedBy: source });
      const before = await readAllRows(env.DB);

      await storage().removeFromSearch(listing, "publisher");

      expect(await removedBy(listing)).toBe(source);
      expect(await readAllRows(env.DB)).toEqual(before);
    },
  );

  test("changes only that listing, and no other table", async () => {
    const listing = await newListing();
    const sibling = await newListing(listing.handle);
    const before = await readAllRows(env.DB);

    await storage().removeFromSearch(listing, "publisher");

    const after = await readAllRows(env.DB);
    expect(await removedBy(sibling)).toBeNull();
    for (const table of Object.keys(before).filter((t) => t !== "listings")) {
      expect(after[table]).toEqual(before[table]);
    }
    expect(after["listings"]).toHaveLength(before["listings"]?.length ?? 0);
  });

  test("writes nothing for a missing or wrong-case listing", async () => {
    const listing = await newListing();
    const before = await readAllRows(env.DB);

    await storage().removeFromSearch(
      { handle: listing.handle, name: "no-such-activity" },
      "publisher",
    );
    await storage().removeFromSearch(
      { ...listing, name: listing.name.toUpperCase() },
      "publisher",
    );

    expect(await readAllRows(env.DB)).toEqual(before);
  });
});

describe("returning a listing to search", () => {
  test("clears a removal by the same source", async () => {
    const listing = await newListing();
    await seedRemoval(env.DB, { ...listing, removedBy: "publisher" });

    await storage().returnToSearch(listing, "publisher");

    expect(await removedBy(listing)).toBeNull();
  });

  test.each([
    ["publisher", "account-deletion"],
    ["publisher", "durables"],
    ["account-deletion", "publisher"],
    ["account-deletion", "durables"],
  ] as const)(
    "returning as %s leaves a removal by %s in place",
    async (asSource, removedSource) => {
      const listing = await newListing();
      await seedRemoval(env.DB, { ...listing, removedBy: removedSource });
      const before = await readAllRows(env.DB);

      await storage().returnToSearch(listing, asSource);

      expect(await removedBy(listing)).toBe(removedSource);
      expect(await readAllRows(env.DB)).toEqual(before);
    },
  );

  test("leaves a listed listing listed and writes nothing", async () => {
    const listing = await newListing();
    const before = await readAllRows(env.DB);

    await storage().returnToSearch(listing, "publisher");

    expect(await removedBy(listing)).toBeNull();
    expect(await readAllRows(env.DB)).toEqual(before);
  });
});

describe("reads that leave a removed listing out", () => {
  test.each(removalSources)(
    "browse and search by publisher leave out a listing removed by %s",
    async (source) => {
      const listing = await newListing();
      const listed = await newListing(listing.handle);

      await storage().removeFromSearch(listing, source);

      const { listings, count } = await storage().browseListings({
        publisher: listing.handle,
        limit: 10,
      });
      expect(listings.map(({ name }) => name)).toEqual([listed.name]);
      expect(count).toBe(1);
    },
  );

  test("search by words leaves out a removed listing", async () => {
    const listing = await newListing();
    const search = () =>
      storage().browseListings({ words: [listing.name], limit: 10 });
    expect((await search()).count).toBe(1);

    await storage().removeFromSearch(listing, "publisher");

    const { listings, count } = await search();
    expect(listings).toEqual([]);
    expect(count).toBe(0);
  });

  test.each(removalSources)(
    "the sitemap's addresses leave out a listing removed by %s",
    async (source) => {
      const listing = await newListing();
      const listed = await newListing(listing.handle);

      await storage().removeFromSearch(listing, source);

      const names = (await storage().listLatestAddresses())
        .filter(({ handle }) => handle === listing.handle)
        .map(({ name }) => name);
      expect(names).toEqual([listed.name]);
    },
  );

  test("a returned listing is in browse and the sitemap again", async () => {
    const listing = await newListing();
    await storage().removeFromSearch(listing, "publisher");

    await storage().returnToSearch(listing, "publisher");

    const { listings } = await storage().browseListings({
      publisher: listing.handle,
      limit: 10,
    });
    expect(listings.map(({ name }) => name)).toEqual([listing.name]);
    expect(
      (await storage().listLatestAddresses()).some(
        ({ handle, name }) =>
          handle === listing.handle && name === listing.name,
      ),
    ).toBe(true);
  });

  test("the listing read and the version read still find a removed listing", async () => {
    const listing = await newListing();
    await storage().removeFromSearch(listing, "publisher");

    expect(await storage().findListingVersions(listing)).toMatchObject({
      ...listing,
      removedBy: "publisher",
      versions: [expect.objectContaining({ version: "1.0.0" })],
    });
    expect(
      await storage().findVersion({ ...listing, version: "1.0.0" }),
    ).toMatchObject({ ...listing, version: "1.0.0" });
  });
});
