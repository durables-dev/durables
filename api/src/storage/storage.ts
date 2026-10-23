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

export { providers, sdks, type Provider, type Sdk } from "./schema";

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

/** Where a published version lives: handle/name@version. */
export interface Address {
  handle: string;
  name: string;
  version: string;
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

/** True when the error, or one it wraps, is a constraint failure in the database. */
const isConstraintFailure = (error: unknown): boolean => {
  for (let e = error; e instanceof Error; e = e.cause) {
    if (/(UNIQUE|FOREIGN KEY) constraint failed/.test(e.message)) {
      return true;
    }
  }
  return false;
};

/**
 * The storage interface (ADR 0005). It is the only code that sees D1 and Drizzle. Handlers
 * reach it through c.var.storage and call its methods.
 */
export class Storage {
  readonly #db: DrizzleD1Database;

  constructor(database: D1Database) {
    this.#db = drizzle(database);
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
      await this.#db.batch([
        // No constraint covers retired handles. The account row is skipped when the handle is
        // retired, and the provider link's foreign key then fails the whole batch.
        this.#db
          .insert(accounts)
          .select(
            sql`select ${id}, unixepoch() where not exists (select 1 from ${retiredHandles} where ${retiredHandles.handle} = ${handle})`,
          ),
        this.#db
          .insert(providerAccounts)
          .values({ provider, providerAccountId, accountId: id }),
        this.#db.insert(handles).values({ handle, accountId: id }),
      ]);
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
}
