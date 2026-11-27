import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, test } from "vitest";
import { storedListing } from "./migration-testing";
import {
  accounts,
  listings,
  removalSources,
  versionDeprecations,
} from "./schema";
import {
  readAllRows,
  seedAccount,
  seedDeprecation,
  seedRemoval,
  seedVersion,
} from "./seed";
import { Storage, type NewListing } from "./storage";

// The storage for removal, deprecation and pending deletion (ADR 0015), on the schema every
// migration has built. The rules here are the database's own, so no route can get past them.

const storage = () => new Storage(env.DB, env.DOCUMENTS);
const db = () => drizzle(env.DB);

/** Adds a version under a stored listing. */
const addVersion = (listing: NewListing, version: string) =>
  seedVersion(env.DB, {
    handle: listing.handle,
    name: listing.name,
    version,
    title: listing.title,
    sdk: listing.sdk,
  });

/** A listing with versions 1.0.0 and 1.1.0. */
const listingWithTwoVersions = async () => {
  const listing = await storedListing();
  await addVersion(listing, "1.1.0");
  return listing;
};

/** Every deprecation recorded for a listing. */
const deprecationsOf = ({ handle, name }: NewListing) =>
  db()
    .select()
    .from(versionDeprecations)
    .where(
      and(
        eq(versionDeprecations.handle, handle),
        eq(versionDeprecations.name, name),
      ),
    );

/** Who removed a listing, as stored. */
const removedBy = async ({ handle, name }: NewListing) =>
  (
    await db()
      .select({ removedBy: listings.removedBy })
      .from(listings)
      .where(and(eq(listings.handle, handle), eq(listings.name, name)))
      .get()
  )?.removedBy;

/** Sets a listing's removal source with plain SQL, so a value outside the type can be tried. */
const writeRemovedBy = ({ handle, name }: NewListing, value: string) =>
  env.DB.prepare(
    "update listings set removed_by = ? where handle = ? and name = ?",
  )
    .bind(value, handle, name)
    .run();

/**
 * The messages of the error a refused write throws, with every error it wraps, so a check can
 * name the constraint the database reported under Drizzle's own message.
 */
const refusal = async (write: Promise<unknown>): Promise<string> => {
  try {
    await write;
  } catch (error) {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
      messages.push(e.message);
    }
    return messages.join("\n");
  }
  throw new Error("The write was not refused.");
};

describe("version deprecations", () => {
  test("records a deprecation with a reason and a replacement from the same listing", async () => {
    const listing = await listingWithTwoVersions();

    await seedDeprecation(env.DB, {
      ...listing,
      version: "1.0.0",
      reason: "Retries forever on a declined card.",
      replacement: "1.1.0",
    });

    expect(await deprecationsOf(listing)).toEqual([
      {
        handle: listing.handle,
        name: listing.name,
        version: "1.0.0",
        reason: "Retries forever on a declined card.",
        replacement: "1.1.0",
      },
    ]);
  });

  test("records a deprecation with no replacement", async () => {
    const listing = await storedListing();

    await seedDeprecation(env.DB, {
      ...listing,
      reason: "Uses an API that was shut down.",
    });

    expect(await deprecationsOf(listing)).toEqual([
      expect.objectContaining({ version: "1.0.0", replacement: null }),
    ]);
  });

  test("refuses a second deprecation for the same version and keeps the first", async () => {
    const listing = await listingWithTwoVersions();
    await seedDeprecation(env.DB, {
      ...listing,
      version: "1.0.0",
      reason: "Retries forever on a declined card.",
      replacement: "1.1.0",
    });

    expect(
      await refusal(
        seedDeprecation(env.DB, {
          ...listing,
          version: "1.0.0",
          reason: "Another reason.",
        }),
      ),
    ).toMatch(/UNIQUE constraint failed: version_deprecations\./);

    expect(await deprecationsOf(listing)).toEqual([
      expect.objectContaining({
        version: "1.0.0",
        reason: "Retries forever on a declined card.",
        replacement: "1.1.0",
      }),
    ]);
  });

  test("allows one deprecation for each of a listing's versions", async () => {
    const listing = await listingWithTwoVersions();

    await seedDeprecation(env.DB, {
      ...listing,
      version: "1.0.0",
      reason: "Broken.",
    });
    await seedDeprecation(env.DB, {
      ...listing,
      version: "1.1.0",
      reason: "Also broken.",
    });

    expect(await deprecationsOf(listing)).toHaveLength(2);
  });

  test("refuses a replacement that is a version of a different listing only", async () => {
    const listing = await storedListing();
    const other = await storedListing();
    await addVersion(other, "2.0.0");

    expect(
      await refusal(
        seedDeprecation(env.DB, {
          ...listing,
          reason: "Use the other activity.",
          replacement: "2.0.0",
        }),
      ),
    ).toMatch(/FOREIGN KEY constraint failed/);

    expect(await deprecationsOf(listing)).toEqual([]);
  });

  test("refuses a replacement that is not a version at all", async () => {
    const listing = await storedListing();

    expect(
      await refusal(
        seedDeprecation(env.DB, {
          ...listing,
          reason: "Broken.",
          replacement: "9.9.9",
        }),
      ),
    ).toMatch(/FOREIGN KEY constraint failed/);
  });

  test("refuses the version itself as its replacement", async () => {
    const listing = await storedListing();

    expect(
      await refusal(
        seedDeprecation(env.DB, {
          ...listing,
          reason: "Broken.",
          replacement: listing.version,
        }),
      ),
    ).toMatch(/CHECK constraint failed: version_deprecations_replacement/);
  });

  test("refuses a deprecation for a version that does not exist", async () => {
    const listing = await storedListing();

    expect(
      await refusal(
        seedDeprecation(env.DB, {
          ...listing,
          version: "2.0.0",
          reason: "Broken.",
        }),
      ),
    ).toMatch(/FOREIGN KEY constraint failed/);
  });

  test("refuses a deprecation with no reason", async () => {
    const listing = await storedListing();

    await expect(
      env.DB.prepare(
        "insert into version_deprecations (handle, name, version, reason) values (?, ?, ?, null)",
      )
        .bind(listing.handle, listing.name, listing.version)
        .run(),
    ).rejects.toThrow(
      /NOT NULL constraint failed: version_deprecations\.reason/,
    );
  });

  test("never changes the version row it deprecates", async () => {
    const listing = await listingWithTwoVersions();
    const before = (await readAllRows(env.DB))["versions"];

    await seedDeprecation(env.DB, {
      ...listing,
      version: "1.0.0",
      reason: "Broken.",
      replacement: "1.1.0",
    });

    expect((await readAllRows(env.DB))["versions"]).toEqual(before);
  });
});

describe("listing removal", () => {
  test("a newly published listing has no removal", async () => {
    const listing = await storedListing();

    expect(await removedBy(listing)).toBeNull();
  });

  test("lists exactly publisher, account deletion and Durables as removal sources", () => {
    expect(removalSources).toEqual([
      "publisher",
      "account-deletion",
      "durables",
    ]);
  });

  test.each(removalSources)("records a removal by %s", async (source) => {
    const listing = await storedListing();

    await seedRemoval(env.DB, { ...listing, removedBy: source });

    expect(await removedBy(listing)).toBe(source);
  });

  test.each(["Publisher", "account_deletion", "admin", "", "publisher "])(
    "refuses a removal source outside the list: %j",
    async (value) => {
      const listing = await storedListing();

      await expect(writeRemovedBy(listing, value)).rejects.toThrow(
        /CHECK constraint failed: listings_removed_by/,
      );
      expect(await removedBy(listing)).toBeNull();
    },
  );

  test("lists a removed listing again by clearing its removal", async () => {
    const listing = await storedListing();
    await seedRemoval(env.DB, { ...listing, removedBy: "publisher" });

    await seedRemoval(env.DB, { ...listing, removedBy: null });

    expect(await removedBy(listing)).toBeNull();
  });
});

describe("pending deletion", () => {
  /** An account's deletion time, as stored. */
  const deletionRequestedAt = async (id: string) =>
    (
      await db()
        .select({ deletionRequestedAt: accounts.deletionRequestedAt })
        .from(accounts)
        .where(eq(accounts.id, id))
        .get()
    )?.deletionRequestedAt;

  test("a new account is not pending deletion", async () => {
    const created = await storage().createAccount({
      provider: "github",
      providerAccountId: `pending-${crypto.randomUUID()}`,
      handle: `new-${crypto.randomUUID().slice(0, 8)}`,
    });
    if (created.outcome !== "created") {
      throw new Error("The account was not created.");
    }

    expect(await deletionRequestedAt(created.account.id)).toBeNull();
  });

  test("records when deletion was asked for", async () => {
    const { accountId } = await seedAccount(env.DB);
    const asked = new Date("2026-11-17T09:30:00Z");

    await db()
      .update(accounts)
      .set({ deletionRequestedAt: asked })
      .where(eq(accounts.id, accountId));

    expect(await deletionRequestedAt(accountId)).toEqual(asked);
  });
});
