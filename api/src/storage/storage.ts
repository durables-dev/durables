import { and, eq, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import {
  accounts,
  handles,
  providerAccounts,
  retiredHandles,
  type Provider,
} from "./schema";

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
}
