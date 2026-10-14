import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/** The sign-in providers a publisher can use (ADR 0007). */
export const providers = ["github", "gitlab", "google", "microsoft"] as const;

export type Provider = (typeof providers)[number];

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/** A Durables account. It exists only once its first activity is published (ADR 0007). */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  createdAt: createdAt(),
});

/**
 * A provider account linked to a Durables account. The primary key makes one provider
 * account belong to only one Durables account.
 */
export const providerAccounts = sqliteTable(
  "provider_accounts",
  {
    provider: text("provider", { enum: providers }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    check(
      "provider_accounts_provider",
      sql.raw(
        `${table.provider.name} in (${providers.map((p) => `'${p}'`).join(", ")})`,
      ),
    ),
  ],
);

/** Handles in use. Each account has one handle, and a handle belongs to one account. */
export const handles = sqliteTable("handles", {
  handle: text("handle").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id),
  createdAt: createdAt(),
});

/** Handles that can never be claimed again. Rows are kept forever (ADR 0007). */
export const retiredHandles = sqliteTable("retired_handles", {
  handle: text("handle").primaryKey(),
  retiredAt: integer("retired_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
