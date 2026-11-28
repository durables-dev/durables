import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { readChips } from "./migration-testing";
import {
  readAllRows,
  seedAccount,
  seedChips,
  seedDeprecation,
  seedRemoval,
} from "./seed";
import {
  Storage,
  type NewListing,
  type NextVersion,
  type RemovalSource,
} from "./storage";

// Recording a later version of an existing listing in real local D1 (ADR 0015): the version
// with its base and note, the base's deprecation, and the end of a publisher's removal, in one
// batch.

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** A listing at 1.0.0 under a new account, written the way a first publish writes it. */
const firstVersion = async (): Promise<NewListing> => {
  const { handle } = await seedAccount(env.DB);
  const listing: NewListing = {
    handle,
    name: `activity-${crypto.randomUUID().slice(0, 8)}`,
    version: "1.0.0",
    title: "Charge card",
    description: "Charges a card through Stripe.",
    sdk: "Python",
  };
  const result = await storage().createPublication({ listing });
  expect(result.outcome).toBe("created");
  return listing;
};

const laterVersion = (first: NewListing): NewListing => ({
  ...first,
  version: "1.1.0",
  title: "Charge card again",
  description: "Charges a card through Stripe, retrying once.",
});

const nextVersion = (overrides: Partial<NextVersion> = {}): NextVersion => ({
  basedOn: "1.0.0",
  whatChanged: "Retries a declined card once.",
  deprecateBase: null,
  ...overrides,
});

const versionsOf = async ({ handle, name }: NewListing) =>
  (await storage().findListingVersions({ handle, name }))?.versions;

describe("recording a later version", () => {
  test("writes the version with its base, note, title, SDK and description, as the latest", async () => {
    const first = await firstVersion();
    const later = laterVersion(first);

    const result = await storage().createPublication({
      listing: later,
      nextVersion: nextVersion(),
    });

    expect(result).toMatchObject({ outcome: "created", accountCreated: false });
    const versions = await versionsOf(first);
    expect(versions?.map(({ version }) => version)).toEqual(["1.1.0", "1.0.0"]);
    expect(versions?.[0]).toMatchObject({
      version: "1.1.0",
      basedOn: "1.0.0",
      whatChanged: "Retries a declined card once.",
      description: "Charges a card through Stripe, retrying once.",
      deprecation: null,
    });
    expect(await storage().findListing(later)).toMatchObject({
      title: "Charge card again",
      sdk: "Python",
    });
  });

  test("leaves the listing's chips as they were", async () => {
    const first = await firstVersion();
    await seedChips(env.DB, { ...first, chips: ["Stripe", "Saga"] });

    const result = await storage().createPublication({
      listing: laterVersion(first),
      nextVersion: nextVersion(),
    });

    expect(result.outcome).toBe("created");
    expect(await readChips(first)).toEqual(["Stripe", "Saga"]);
  });

  test("leaves a listing with no chips with none", async () => {
    const first = await firstVersion();

    await storage().createPublication({
      listing: laterVersion(first),
      nextVersion: nextVersion(),
    });

    expect(await readChips(first)).toEqual([]);
  });

  test("leaves every existing version's row as it was", async () => {
    const first = await firstVersion();
    const before = (await readAllRows(env.DB))["versions"];

    await storage().createPublication({
      listing: laterVersion(first),
      nextVersion: nextVersion({ deprecateBase: { reason: "Replaced" } }),
    });

    const after = (await readAllRows(env.DB))["versions"] ?? [];
    for (const row of before ?? []) {
      expect(after).toContainEqual(row);
    }
  });

  test("deprecates the base version with the new version as its replacement", async () => {
    const first = await firstVersion();

    await storage().createPublication({
      listing: laterVersion(first),
      nextVersion: nextVersion({
        deprecateBase: { reason: "Replaced by 1.1.0" },
      }),
    });

    const versions = await versionsOf(first);
    expect(versions?.find(({ version }) => version === "1.0.0")).toMatchObject({
      deprecation: { reason: "Replaced by 1.1.0", replacement: "1.1.0" },
    });
    expect(versions?.[0]?.deprecation).toBeNull();
  });

  test("replaces an existing deprecation of the base version", async () => {
    const first = await firstVersion();
    await seedDeprecation(env.DB, {
      ...first,
      reason: "Charges twice.",
      replacement: null,
    });

    await storage().createPublication({
      listing: laterVersion(first),
      nextVersion: nextVersion({
        deprecateBase: { reason: "Replaced by 1.1.0" },
      }),
    });

    expect((await versionsOf(first))?.[1]?.deprecation).toEqual({
      reason: "Replaced by 1.1.0",
      replacement: "1.1.0",
    });
  });

  test("writes neither the version nor the deprecation when the batch fails", async () => {
    // The base doesn't exist, so the deprecation's insert, after the version's, fails.
    const first = await firstVersion();
    await seedRemoval(env.DB, { ...first, removedBy: "publisher" });
    const before = await readAllRows(env.DB);

    await expect(
      storage().createPublication({
        listing: laterVersion(first),
        nextVersion: nextVersion({
          basedOn: "0.9.0",
          deprecateBase: { reason: "Replaced by 1.1.0" },
        }),
      }),
    ).rejects.toThrow();

    expect(await readAllRows(env.DB)).toEqual(before);
  });

  test("reports address-taken and writes nothing for a version the listing has", async () => {
    const first = await firstVersion();
    await seedRemoval(env.DB, { ...first, removedBy: "publisher" });
    const before = await readAllRows(env.DB);

    const result = await storage().createPublication({
      listing: { ...laterVersion(first), version: "1.0.0" },
      nextVersion: nextVersion({ deprecateBase: { reason: "Replaced" } }),
    });

    expect(result).toEqual({ outcome: "address-taken" });
    expect(await readAllRows(env.DB)).toEqual(before);
  });

  test("returns a listing the publisher removed to search", async () => {
    const first = await firstVersion();
    await seedRemoval(env.DB, { ...first, removedBy: "publisher" });

    await storage().createPublication({
      listing: laterVersion(first),
      nextVersion: nextVersion(),
    });

    expect((await storage().findListingVersions(first))?.removedBy).toBeNull();
  });

  test.each<RemovalSource>(["account-deletion", "durables"])(
    "leaves a removal by %s in place",
    async (removedBy) => {
      const first = await firstVersion();
      await seedRemoval(env.DB, { ...first, removedBy });

      await storage().createPublication({
        listing: laterVersion(first),
        nextVersion: nextVersion(),
      });

      expect((await storage().findListingVersions(first))?.removedBy).toBe(
        removedBy,
      );
    },
  );
});
