import { and, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { containsPattern, LIKE_ESCAPE } from "./like-pattern";
import {
  accounts,
  handles,
  listings,
  providerAccounts,
  retiredHandles,
  versions,
  type Provider,
  type Sdk,
} from "./schema";
import {
  DocumentWriteFailure,
  versionDocumentKey,
  type Address,
  type VersionDocument,
  type WriteVersionDocumentResult,
} from "./version-document";

export { providers, sdks, type Provider, type Sdk } from "./schema";
export {
  DocumentWriteFailure,
  type Address,
  type Snippet,
  type VersionDocument,
  type WriteVersionDocumentResult,
} from "./version-document";

/** A provider account: which provider, and the account's ID at that provider. */
export interface ProviderIdentity {
  provider: Provider;
  providerAccountId: string;
}

/** A Durables account, with its handle. */
export interface Account {
  id: string;
  handle: string | null;
}

/** What the first publish records for a new account: who signed in, and the chosen handle. */
export interface NewAccount extends ProviderIdentity {
  handle: string;
}

/**
 * The outcome of creating an account. Created means this call wrote the account, its
 * provider link and its handle. Existing means the provider identity already had an account,
 * and nothing was written. Handle-taken means the handle is in use or retired, and nothing
 * was written.
 */
export type CreateAccountResult =
  | { outcome: "created"; account: Account & { handle: string } }
  | { outcome: "existing"; account: Account }
  | { outcome: "handle-taken" };

/** What publishing records for a new listing and its first version. */
export interface NewListing extends Address {
  title: string;
  /** The one-line description. It belongs to the listing and can change later. */
  description: string;
  sdk: Sdk;
  /** The integrations implied by the code's imports. Empty when there are none. */
  integrations: readonly string[];
}

/** A listing at one version's address, with every field search reads. */
export interface Listing extends NewListing {
  integrations: string[];
  publishedAt: Date;
}

/** A published version's own fields. None of them can change after publishing. */
export interface Version extends Address {
  title: string;
  sdk: Sdk;
  integrations: string[];
  publishedAt: Date;
}

/** A listing's newest address, by its highest version number, and when that version was published. */
export interface LatestAddress extends Address {
  publishedAt: Date;
}

/** A listing's current one-line description, which can change after publishing (ADR 0006). */
export interface ListingDescription {
  handle: string;
  name: string;
  description: string;
}

/**
 * Where a browse batch ends: the last card's relevance score, published date, handle and name.
 * The score is 0 when there are no words.
 */
export interface BrowsePosition {
  score: number;
  publishedAt: Date;
  handle: string;
  name: string;
}

/**
 * What browse narrows by and where it starts. An empty or absent list does not filter. Several
 * SDKs match any one of them, as do several integrations. The publisher matches the handle.
 * Every word must appear in the title, description, address, SDK or one of the integrations.
 */
export interface BrowseFilter {
  /** The search words. Empty or absent means no words. */
  words?: readonly string[] | undefined;
  sdks?: readonly Sdk[] | undefined;
  integrations?: readonly string[] | undefined;
  publisher?: string | undefined;
  /** Start after this card. Absent for the first batch. */
  after?: BrowsePosition | undefined;
  /** The most cards to return. */
  limit: number;
}

/**
 * A browse result: a listing and its relevance score. Each word in the title scores 3 and each
 * word in the description scores 1. The score is 0 when there are no words.
 */
export interface BrowseListing extends Listing {
  score: number;
}

/**
 * A browse batch and the count of every match. Listings are highest score first, then newest
 * first, so with no words they are newest first.
 */
export interface BrowseResult {
  listings: BrowseListing[];
  count: number;
}

/** The outcome of creating a listing. An address can be written once. */
export type CreateListingResult =
  { outcome: "created"; listing: Listing } | { outcome: "address-taken" };

/**
 * What publishing records in the database: the listing and its first version, and the
 * account for a provider identity that has none yet. The new account's handle is the
 * listing's handle.
 */
export interface NewPublication {
  listing: NewListing;
  /** The provider identity to create the account for. Absent when the account exists. */
  newAccount?: ProviderIdentity;
}

/**
 * The outcome of recording a publication. Created means every row was written, and
 * accountCreated says whether the account was among them. Address-taken and handle-taken mean
 * nothing was written.
 */
export type CreatePublicationResult =
  | { outcome: "created"; listing: Listing; accountCreated: boolean }
  | { outcome: "address-taken" }
  | { outcome: "handle-taken" };

/** True when the error, or one it wraps, is a unique-key failure on the listing tables. */
const isAddressConflict = (error: unknown): boolean => {
  for (let e = error; e instanceof Error; e = e.cause) {
    if (/UNIQUE constraint failed: (listings|versions)\./.test(e.message)) {
      return true;
    }
  }
  return false;
};

/** True when the error, or one it wraps, is a constraint failure in the database. */
const isConstraintFailure = (error: unknown): boolean => {
  for (let e = error; e instanceof Error; e = e.cause) {
    if (/(UNIQUE|FOREIGN KEY) constraint failed/.test(e.message)) {
      return true;
    }
  }
  return false;
};

/** The listing as created, from what was written and the version row the insert returned. */
const createdListing = (
  listing: NewListing,
  created: { publishedAt: Date } | undefined,
): Listing => {
  if (created === undefined) {
    throw new Error("The version insert returned no row.");
  }
  return { ...listing, integrations: [...listing.integrations], ...created };
};

/**
 * Orders a listing's versions from the highest version number down. Each of the major, minor
 * and patch numbers compares as a number, so 1.10.0 is above 1.9.0. SQLite's integer cast reads
 * the leading digits of each part.
 */
const highestVersionFirst = () => {
  const afterMajor = sql`substr(${versions.version}, instr(${versions.version}, '.') + 1)`;
  const afterMinor = sql`substr(${afterMajor}, instr(${afterMajor}, '.') + 1)`;
  return sql`cast(${versions.version} as integer) desc, cast(${afterMajor} as integer) desc, cast(${afterMinor} as integer) desc, ${versions.version} desc`;
};

/**
 * The storage interface (ADR 0005). It is the only code that sees D1, R2 and Drizzle.
 * Handlers reach it through c.var.storage and call its methods.
 */
export class Storage {
  readonly #db: DrizzleD1Database;
  readonly #documents: R2Bucket;

  constructor(database: D1Database, documents: R2Bucket) {
    this.#db = drizzle(database);
    this.#documents = documents;
  }

  /** True when the database answers a query. */
  async isAvailable(): Promise<boolean> {
    const row = await this.#db.get<{ ok: number }>(sql`select 1 as ok`);
    return row.ok === 1;
  }

  /** The account a provider identity is linked to, or undefined when it has none. */
  async findAccountByProviderIdentity({
    provider,
    providerAccountId,
  }: ProviderIdentity): Promise<Account | undefined> {
    return this.#db
      .select({ id: accounts.id, handle: handles.handle })
      .from(providerAccounts)
      .innerJoin(accounts, eq(accounts.id, providerAccounts.accountId))
      .leftJoin(handles, eq(handles.accountId, accounts.id))
      .where(
        and(
          eq(providerAccounts.provider, provider),
          eq(providerAccounts.providerAccountId, providerAccountId),
        ),
      )
      .get();
  }

  /**
   * False when the handle is in use or retired. Reserved words and the format rule are
   * checked by the handle schema, not here.
   */
  async isHandleAvailable(handle: string): Promise<boolean> {
    const taken = await this.#db
      .select({ handle: handles.handle })
      .from(handles)
      .where(eq(handles.handle, handle))
      .unionAll(
        this.#db
          .select({ handle: retiredHandles.handle })
          .from(retiredHandles)
          .where(eq(retiredHandles.handle, handle)),
      )
      .limit(1);
    return taken.length === 0;
  }

  /**
   * Creates the account for a provider identity, with its provider link and its handle, in one
   * database batch, so either all three rows are written or none are (ADR 0007). Reserved
   * words and the format rule are checked by the handle schema, not here.
   */
  async createAccount(newAccount: NewAccount): Promise<CreateAccountResult> {
    const { provider, providerAccountId, handle } = newAccount;
    const existing = await this.findAccountByProviderIdentity(newAccount);
    if (existing !== undefined) {
      return { outcome: "existing", account: existing };
    }
    const id = crypto.randomUUID();
    try {
      await this.#db.batch(
        this.#accountInserts(id, { provider, providerAccountId, handle }),
      );
      return { outcome: "created", account: { id, handle } };
    } catch (error) {
      if (!isConstraintFailure(error)) {
        throw error;
      }
      // The handle is in use or retired, or another request created this account since the
      // read above. A batch that fails for any other reason is unexpected.
      const raced = await this.findAccountByProviderIdentity(newAccount);
      if (raced !== undefined) {
        return { outcome: "existing", account: raced };
      }
      if (!(await this.isHandleAvailable(handle))) {
        return { outcome: "handle-taken" };
      }
      throw error;
    }
  }

  /**
   * Creates a listing and its first version in one database batch. When the listing or the
   * version address already exists, nothing is written and the outcome is address-taken.
   */
  async createListing(listing: NewListing): Promise<CreateListingResult> {
    try {
      const [, [created]] = await this.#db.batch(this.#listingInserts(listing));
      return { outcome: "created", listing: createdListing(listing, created) };
    } catch (error) {
      if (isAddressConflict(error)) {
        return { outcome: "address-taken" };
      }
      throw error;
    }
  }

  /**
   * Records a publication in one database batch, so either every row is written or none are:
   * the account, its provider link and its handle when the identity has no account, then the
   * listing and its first version. The account's handle is the listing's handle.
   */
  async createPublication({
    listing,
    newAccount,
  }: NewPublication): Promise<CreatePublicationResult> {
    if (newAccount === undefined) {
      const result = await this.createListing(listing);
      return result.outcome === "created"
        ? { ...result, accountCreated: false }
        : result;
    }
    const { handle } = listing;
    const id = crypto.randomUUID();
    try {
      const [, , , , [created]] = await this.#db.batch([
        ...this.#accountInserts(id, { ...newAccount, handle }),
        ...this.#listingInserts(listing),
      ]);
      return {
        outcome: "created",
        listing: createdListing(listing, created),
        accountCreated: true,
      };
    } catch (error) {
      if (!isConstraintFailure(error)) {
        throw error;
      }
      // Another publish created this identity's account since the caller looked. Its handle
      // is permanent, so the listing goes under it only when it is the same handle.
      const raced = await this.findAccountByProviderIdentity(newAccount);
      if (raced !== undefined) {
        return raced.handle === handle
          ? this.createPublication({ listing })
          : { outcome: "handle-taken" };
      }
      if (!(await this.isHandleAvailable(handle))) {
        return { outcome: "handle-taken" };
      }
      throw error;
    }
  }

  /** The inserts that create an account with its provider link and its handle. */
  #accountInserts(
    id: string,
    { provider, providerAccountId, handle }: NewAccount,
  ) {
    return [
      // No constraint covers retired handles. The account row is skipped when the handle is
      // retired, and the provider link's foreign key then fails the whole batch. The select
      // gives a value for every column of accounts, in order. A new account is not pending
      // deletion.
      this.#db
        .insert(accounts)
        .select(
          sql`select ${id}, unixepoch(), null where not exists (select 1 from ${retiredHandles} where ${retiredHandles.handle} = ${handle})`,
        ),
      this.#db
        .insert(providerAccounts)
        .values({ provider, providerAccountId, accountId: id }),
      this.#db.insert(handles).values({ handle, accountId: id }),
    ] as const;
  }

  /** The inserts that create a listing and its first version. */
  #listingInserts(listing: NewListing) {
    const { handle, name, version, title, description, sdk } = listing;
    const integrations = [...listing.integrations];
    return [
      this.#db.insert(listings).values({ handle, name, description }),
      this.#db
        .insert(versions)
        .values({ handle, name, version, title, sdk, integrations })
        .returning({ publishedAt: versions.publishedAt }),
    ] as const;
  }

  /** The listing at an address, with its version's fields, or undefined when there is none. */
  async findListing({
    handle,
    name,
    version,
  }: Address): Promise<Listing | undefined> {
    return this.#db
      .select({
        handle: versions.handle,
        name: versions.name,
        version: versions.version,
        title: versions.title,
        description: listings.description,
        sdk: versions.sdk,
        integrations: versions.integrations,
        publishedAt: versions.publishedAt,
      })
      .from(versions)
      .innerJoin(
        listings,
        and(
          eq(listings.handle, versions.handle),
          eq(listings.name, versions.name),
        ),
      )
      .where(
        and(
          eq(versions.handle, handle),
          eq(versions.name, name),
          eq(versions.version, version),
        ),
      )
      .get();
  }

  /**
   * One batch of browse results and the count of every match. Each listing appears once, as its
   * highest version number, and the filters and words apply to that version. Cards are highest
   * score first, then newest first by that version's published date, then by handle and name, so
   * every card has one place in the order and a batch can start after any of them. With no
   * words every score is 0, so cards are newest first.
   */
  async browseListings({
    words = [],
    sdks = [],
    integrations = [],
    publisher,
    after,
    limit,
  }: BrowseFilter): Promise<BrowseResult> {
    // The words go to D1 as one JSON array of LIKE patterns, read with json_each, so a search
    // binds one parameter however many words it has. LIKE ignores ASCII letter case.
    const patterns = JSON.stringify(words.map(containsPattern));
    const like = (text: SQL | SQLiteColumn, pattern: SQL) =>
      sql`(${text} like ${pattern} escape ${LIKE_ESCAPE})`;
    const word = sql.raw("search_word.value");
    const eachWord = sql`json_each(${patterns}) as search_word`;

    const score =
      words.length === 0
        ? sql<number>`0`
        : sql<number>`(select coalesce(sum(${like(versions.title, word)} * 3 + ${like(listings.description, word)}), 0) from ${eachWord})`;

    const ranked = this.#db.$with("ranked").as(
      this.#db
        .select({
          handle: versions.handle,
          name: versions.name,
          version: versions.version,
          title: versions.title,
          description: listings.description,
          sdk: versions.sdk,
          integrations: versions.integrations,
          publishedAt: versions.publishedAt,
          score: score.as("score"),
          rank: sql<number>`row_number() over (partition by ${versions.handle}, ${versions.name} order by ${highestVersionFirst()})`.as(
            "rank",
          ),
        })
        .from(versions)
        .innerJoin(
          listings,
          and(
            eq(listings.handle, versions.handle),
            eq(listings.name, versions.name),
          ),
        ),
    );

    const filters: SQL[] = [eq(ranked.rank, 1)];
    if (words.length > 0) {
      // Every word appears in at least one field. The address is matched as the site shows it.
      const address = sql`${ranked.handle} || '/' || ${ranked.name} || '@' || ${ranked.version}`;
      const inIntegrations = sql`exists (select 1 from json_each(${ranked.integrations}) as integration where ${like(sql.raw("integration.value"), word)})`;
      filters.push(
        sql`not exists (select 1 from ${eachWord} where not (${like(ranked.title, word)} or ${like(ranked.description, word)} or ${like(address, word)} or ${like(ranked.sdk, word)} or ${inIntegrations}))`,
      );
    }
    if (sdks.length > 0) {
      // One JSON parameter however many values were sent, as with the words: D1 binds at most 100.
      filters.push(
        sql`${ranked.sdk} in (select value from json_each(${JSON.stringify(sdks)}))`,
      );
    }
    if (integrations.length > 0) {
      // Integrations are stored as a JSON array in text, so each listing's are read with json_each.
      filters.push(
        sql`exists (select 1 from json_each(${ranked.integrations}) as integration where integration.value in (select value from json_each(${JSON.stringify(integrations)})))`,
      );
    }
    if (publisher !== undefined) {
      filters.push(eq(ranked.handle, publisher));
    }
    const matches = and(...filters);

    const startAfter = (position: BrowsePosition) => {
      // published_at is stored in whole seconds.
      const second = Math.floor(position.publishedAt.getTime() / 1000);
      return or(
        sql`${ranked.score} < ${position.score}`,
        and(
          sql`${ranked.score} = ${position.score}`,
          or(
            sql`${ranked.publishedAt} < ${second}`,
            and(
              sql`${ranked.publishedAt} = ${second}`,
              or(
                sql`${ranked.handle} > ${position.handle}`,
                and(
                  eq(ranked.handle, position.handle),
                  sql`${ranked.name} > ${position.name}`,
                ),
              ),
            ),
          ),
        ),
      );
    };

    const [rows, [total]] = await this.#db.batch([
      this.#db
        .with(ranked)
        .select({
          handle: ranked.handle,
          name: ranked.name,
          version: ranked.version,
          title: ranked.title,
          description: ranked.description,
          sdk: ranked.sdk,
          integrations: ranked.integrations,
          publishedAt: ranked.publishedAt,
          score: ranked.score,
        })
        .from(ranked)
        .where(after === undefined ? matches : and(matches, startAfter(after)))
        .orderBy(
          desc(ranked.score),
          desc(ranked.publishedAt),
          ranked.handle,
          ranked.name,
        )
        .limit(limit),
      this.#db
        .with(ranked)
        .select({ count: count() })
        .from(ranked)
        .where(matches),
    ]);
    return { listings: rows, count: total?.count ?? 0 };
  }

  /**
   * Every listing's highest version, as the sitemap lists them: by handle, then name. The
   * sitemap protocol allows 50,000 addresses in one file, far more than the registry holds.
   */
  async listLatestAddresses(): Promise<LatestAddress[]> {
    const ranked = this.#db.$with("ranked").as(
      this.#db
        .select({
          handle: versions.handle,
          name: versions.name,
          version: versions.version,
          publishedAt: versions.publishedAt,
          rank: sql<number>`row_number() over (partition by ${versions.handle}, ${versions.name} order by ${highestVersionFirst()})`.as(
            "rank",
          ),
        })
        .from(versions),
    );
    return this.#db
      .with(ranked)
      .select({
        handle: ranked.handle,
        name: ranked.name,
        version: ranked.version,
        publishedAt: ranked.publishedAt,
      })
      .from(ranked)
      .where(eq(ranked.rank, 1))
      .orderBy(ranked.handle, ranked.name);
  }

  /**
   * The version at an address, without the listing's description, or undefined when there
   * is none. Addresses match exactly, so a wrong-case address finds nothing.
   */
  async findVersion({
    handle,
    name,
    version,
  }: Address): Promise<Version | undefined> {
    return this.#db
      .select({
        handle: versions.handle,
        name: versions.name,
        version: versions.version,
        title: versions.title,
        sdk: versions.sdk,
        integrations: versions.integrations,
        publishedAt: versions.publishedAt,
      })
      .from(versions)
      .where(
        and(
          eq(versions.handle, handle),
          eq(versions.name, name),
          eq(versions.version, version),
        ),
      )
      .get();
  }

  /**
   * The current description of the listing at a handle and name, or undefined when there is
   * none. Handles and names match exactly, so a wrong-case one finds nothing.
   */
  async findListingDescription({
    handle,
    name,
  }: Omit<Address, "version">): Promise<ListingDescription | undefined> {
    return this.#db
      .select({
        handle: listings.handle,
        name: listings.name,
        description: listings.description,
      })
      .from(listings)
      .where(and(eq(listings.handle, handle), eq(listings.name, name)))
      .get();
  }

  /**
   * Changes the current description of the listing at a handle and name, and returns the
   * listing as stored, or undefined when no listing is there. Only the description column
   * changes. Version rows and version documents are never touched (ADR 0006). Handles and
   * names match exactly.
   */
  async updateListingDescription({
    handle,
    name,
    description,
  }: ListingDescription): Promise<ListingDescription | undefined> {
    return this.#db
      .update(listings)
      .set({ description })
      .where(and(eq(listings.handle, handle), eq(listings.name, name)))
      .returning({
        handle: listings.handle,
        name: listings.name,
        description: listings.description,
      })
      .get();
  }

  /**
   * Writes a version's document, create-only. When a document already exists at the
   * address, nothing is written and the outcome is already-exists. The conditional put this
   * rests on is an accepted risk (ADR 0005, Notes).
   *
   * @throws {DocumentWriteFailure} when the write fails for any other reason.
   */
  async writeVersionDocument(
    address: Address,
    document: VersionDocument,
  ): Promise<WriteVersionDocumentResult> {
    const key = versionDocumentKey(address);
    let written: R2Object | null;
    try {
      written = await this.#documents.put(key, JSON.stringify(document), {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
      });
    } catch (error) {
      throw new DocumentWriteFailure(key, error);
    }
    return written === null
      ? { outcome: "already-exists" }
      : { outcome: "created" };
  }

  /**
   * Deletes the version document at an address. Publishing calls it to clean up a document
   * whose database rows were never written (ADR 0005). Deleting a missing key is not an error.
   */
  async deleteVersionDocument(address: Address): Promise<void> {
    await this.#documents.delete(versionDocumentKey(address));
  }

  /** The version document at an address, or undefined when there is none. */
  async readVersionDocument(
    address: Address,
  ): Promise<VersionDocument | undefined> {
    const stored = await this.#documents.get(versionDocumentKey(address));
    return stored === null ? undefined : await stored.json<VersionDocument>();
  }
}
