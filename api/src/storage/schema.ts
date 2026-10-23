import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { AcceptedSdk } from "../checks/facts";

/** The sign-in providers a publisher can use (ADR 0007). */
export const providers = ["github", "gitlab", "google", "microsoft"] as const;

export type Provider = (typeof providers)[number];

/** The SDKs a published version can be written in (ADR 0008). */
export const sdks = [
  "Python",
  "TypeScript",
  ".NET",
] as const satisfies readonly AcceptedSdk[];

export type Sdk = (typeof sdks)[number];

/** A SQL check that a text column holds one of a fixed list of values. */
const oneOf = (column: { name: string }, values: readonly string[]) =>
  sql.raw(`${column.name} in (${values.map((v) => `'${v}'`).join(", ")})`);

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
    check("provider_accounts_provider", oneOf(table.provider, providers)),
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

/**
 * A listing: one handle and name, under which versions are published. It holds the fields
 * that can change after publishing, which today is only the one-line description (ADR 0006).
 * Search reads it with its versions (ADR 0005).
 */
export const listings = sqliteTable(
  "listings",
  {
    handle: text("handle")
      .notNull()
      .references(() => handles.handle),
    name: text("name").notNull(),
    description: text("description").notNull(),
  },
  (table) => [primaryKey({ columns: [table.handle, table.name] })],
);

/**
 * A published version of a listing, at the address handle/name@version. Its fields never
 * change once written. The primary key makes each address writable once.
 */
export const versions = sqliteTable(
  "versions",
  {
    handle: text("handle").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    sdk: text("sdk", { enum: sdks }).notNull(),
    /** The integrations implied by the code's imports, as a JSON array of names. */
    integrations: text("integrations", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    publishedAt: integer("published_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    primaryKey({ columns: [table.handle, table.name, table.version] }),
    foreignKey({
      columns: [table.handle, table.name],
      foreignColumns: [listings.handle, listings.name],
    }),
    check("versions_sdk", oneOf(table.sdk, sdks)),
  ],
);
