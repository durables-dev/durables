import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sdks, type Sdk } from "../sdks/sdk-list";

/** The sign-in providers a publisher can use (ADR 0007). */
export const providers = ["github", "gitlab", "google", "microsoft"] as const;

export type Provider = (typeof providers)[number];

/** The SDKs publishing accepts today (ADR 0008): the api's SDK list. */
export { sdks, type Sdk };

/**
 * The SDKs a stored version can be written in: every SDK Temporal officially supports, in
 * Temporal's order. The `versions_sdk` check allows exactly these. It is wider than the api's
 * list until every SDK is accepted, so the table never has to be rebuilt again to add one.
 */
export const storedSdks = [
  "Go",
  "Java",
  "Python",
  "TypeScript",
  ".NET",
  "Ruby",
  "PHP",
  "Rust",
] as const satisfies readonly string[];

export type StoredSdk = (typeof storedSdks)[number];

/** A SQL check that a text column holds one of a fixed list of values. */
const oneOf = (column: { name: string }, values: readonly string[]) =>
  sql.raw(`${column.name} in (${values.map((v) => `'${v}'`).join(", ")})`);

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/**
 * A Durables account. It exists only once its first activity is published (ADR 0007). An
 * account is pending deletion while it has the time its deletion was asked for, and for 30 days
 * after that time it can still be restored (ADR 0015).
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  createdAt: createdAt(),
  /** When the publisher asked to delete the account. Null when it is not pending deletion. */
  deletionRequestedAt: integer("deletion_requested_at", { mode: "timestamp" }),
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
 * Who can take a listing out of search (ADR 0015): its publisher, account deletion, or Durables.
 * Each way back into search clears only its own kind of removal.
 */
export const removalSources = [
  "publisher",
  "account-deletion",
  "durables",
] as const;

export type RemovalSource = (typeof removalSources)[number];

/**
 * A listing: one handle and name, under which versions are published. It holds the listing's
 * fields that can change after publishing (ADR 0006, ADR 0015). Search reads it with its
 * versions (ADR 0005). The description belongs to each version, not the listing (ADR 0015).
 */
export const listings = sqliteTable(
  "listings",
  {
    handle: text("handle")
      .notNull()
      .references(() => handles.handle),
    name: text("name").notNull(),
    /** Who took the listing out of search. Null while it is listed. */
    removedBy: text("removed_by", { enum: removalSources }),
    /**
     * The listing's chips, as a JSON array of names. They apply to every version of the listing.
     * Only migrations write them; publishing leaves a new listing with none.
     */
    chips: text("chips", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
  },
  (table) => [
    primaryKey({ columns: [table.handle, table.name] }),
    check("listings_removed_by", oneOf(table.removedBy, removalSources)),
  ],
);

/**
 * A published version of a listing, at the address handle/name@version. Its fields never
 * change once written, except its current description (ADR 0015). The primary key makes each
 * address writable once.
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
    /**
     * The version's current one-line description, which its publisher can change (ADR 0015).
     * The description it was published with stays in its version document.
     */
    description: text("description").notNull().default(""),
    /** The What changed note. Null for a version published before notes existed. */
    whatChanged: text("what_changed"),
    /** The version number of this listing's version it was based on. Null for a first version. */
    basedOn: text("based_on"),
  },
  (table) => [
    primaryKey({ columns: [table.handle, table.name, table.version] }),
    foreignKey({
      columns: [table.handle, table.name],
      foreignColumns: [listings.handle, listings.name],
    }),
    check("versions_sdk", oneOf(table.sdk, storedSdks)),
  ],
);

/**
 * A version's deprecation (ADR 0015). It is kept apart from the version row, which never
 * changes, and undoing a deprecation deletes it. The primary key allows one per version. The
 * replacement is a version number of the same listing, and never the version itself.
 */
export const versionDeprecations = sqliteTable(
  "version_deprecations",
  {
    handle: text("handle").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    reason: text("reason").notNull(),
    /** The version to use instead. Null when there is no replacement. */
    replacement: text("replacement"),
  },
  (table) => [
    primaryKey({ columns: [table.handle, table.name, table.version] }),
    foreignKey({
      columns: [table.handle, table.name, table.version],
      foreignColumns: [versions.handle, versions.name, versions.version],
    }),
    foreignKey({
      columns: [table.handle, table.name, table.replacement],
      foreignColumns: [versions.handle, versions.name, versions.version],
    }),
    check(
      "version_deprecations_replacement",
      sql`${sql.raw(table.replacement.name)} <> ${sql.raw(table.version.name)}`,
    ),
  ],
);
