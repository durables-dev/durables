import { sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

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
}
