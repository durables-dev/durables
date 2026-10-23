import { and, eq, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
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

/** A listing's current one-line description, which can change after publishing (ADR 0006). */
export interface ListingDescription {
  handle: string;
  name: string;
  description: string;
}

/** The outcome of creating a listing. An address can be written once. */
export type CreateListingResult =
  { outcome: "created"; listing: Listing } | { outcome: "address-taken" };

/** True when the error, or one it wraps, is a unique-key failure on the listing tables. */
const isAddressConflict = (error: unknown): boolean => {
  for (let e = error; e instanceof Error; e = e.cause) {
    if (/UNIQUE constraint failed: (listings|versions)\./.test(e.message)) {
      return true;
    }
  }
  return false;
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
   * Creates a listing and its first version in one database batch. When the listing or the
   * version address already exists, nothing is written and the outcome is address-taken.
   */
  async createListing(listing: NewListing): Promise<CreateListingResult> {
    const { handle, name, version, title, description, sdk } = listing;
    const integrations = [...listing.integrations];
    try {
      const [, [created]] = await this.#db.batch([
        this.#db.insert(listings).values({ handle, name, description }),
        this.#db
          .insert(versions)
          .values({ handle, name, version, title, sdk, integrations })
          .returning({ publishedAt: versions.publishedAt }),
      ]);
      if (created === undefined) {
        throw new Error("The version insert returned no row.");
      }
      return {
        outcome: "created",
        listing: { ...listing, integrations, ...created },
      };
    } catch (error) {
      if (isAddressConflict(error)) {
        return { outcome: "address-taken" };
      }
      throw error;
    }
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

  /** The version document at an address, or undefined when there is none. */
  async readVersionDocument(
    address: Address,
  ): Promise<VersionDocument | undefined> {
    const stored = await this.#documents.get(versionDocumentKey(address));
    return stored === null ? undefined : await stored.json<VersionDocument>();
  }
}
