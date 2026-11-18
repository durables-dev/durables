import { SQLiteSyncDialect, getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  listings,
  removalSources,
  sdks,
  storedSdks,
  versionDeprecations,
  versions,
  type RemovalSource,
  type Sdk,
  type StoredSdk,
} from "./schema";

/** A check the storage schema declares on a table, as SQL. */
const declaredCheck = (
  table: typeof versions | typeof listings | typeof versionDeprecations,
  name: string,
) => {
  const check = getTableConfig(table).checks.find((c) => c.name === name);
  if (check === undefined) {
    throw new Error(`The storage schema has no ${name} check.`);
  }
  return new SQLiteSyncDialect().sqlToQuery(check.value).sql;
};

const versionsSdkCheck = () => declaredCheck(versions, "versions_sdk");

describe("storage schema, the SDKs a version can be stored in", () => {
  test("lists every SDK Temporal officially supports, in Temporal's order", () => {
    expect(storedSdks).toEqual([
      "Go",
      "Java",
      "Python",
      "TypeScript",
      ".NET",
      "Ruby",
      "PHP",
      "Rust",
    ]);
  });

  test("declares the versions_sdk check over all eight SDKs", () => {
    expect(versionsSdkCheck()).toBe(
      "sdk in ('Go', 'Java', 'Python', 'TypeScript', '.NET', 'Ruby', 'PHP', 'Rust')",
    );
  });

  test("can store every SDK publishing accepts", () => {
    expect(storedSdks).toEqual(expect.arrayContaining([...sdks]));
    expectTypeOf<Sdk>().toExtend<StoredSdk>();
  });

  test.each(["Go", "Java", "Ruby", "PHP", "Rust"] as const)(
    "accepts %s as a stored SDK",
    (sdk) => {
      expectTypeOf(sdk).toExtend<StoredSdk>();
      expect(storedSdks).toContain(sdk);
    },
  );

  test("does not accept an SDK outside the list", () => {
    expectTypeOf<"Kotlin">().not.toExtend<StoredSdk>();
    expect(storedSdks).not.toContain("Kotlin");
  });
});

describe("storage schema, who can remove a listing", () => {
  test("lists the publisher, account deletion and Durables, and nothing else", () => {
    expect(removalSources).toEqual([
      "publisher",
      "account-deletion",
      "durables",
    ]);
    expectTypeOf<RemovalSource>().toEqualTypeOf<
      "publisher" | "account-deletion" | "durables"
    >();
  });

  test("declares the listings_removed_by check over exactly those sources", () => {
    expect(declaredCheck(listings, "listings_removed_by")).toBe(
      "removed_by in ('publisher', 'account-deletion', 'durables')",
    );
  });

  test("leaves a listing with no removal by default", () => {
    const removedBy = getTableConfig(listings).columns.find(
      ({ name }) => name === "removed_by",
    );
    expect(removedBy).toMatchObject({ notNull: false, hasDefault: false });
  });
});

describe("storage schema, version deprecations", () => {
  test("allows one deprecation per version", () => {
    const [primaryKey] = getTableConfig(versionDeprecations).primaryKeys;
    expect(primaryKey?.columns.map(({ name }) => name)).toEqual([
      "handle",
      "name",
      "version",
    ]);
  });

  test("keeps the replacement within the same listing", () => {
    const references = getTableConfig(versionDeprecations).foreignKeys.map(
      (key) => {
        const { columns, foreignColumns } = key.reference();
        return {
          from: columns.map(({ name }) => name),
          to: foreignColumns.map(({ name }) => name),
        };
      },
    );
    expect(references).toContainEqual({
      from: ["handle", "name", "replacement"],
      to: ["handle", "name", "version"],
    });
  });

  test("never names the version itself as its replacement", () => {
    expect(
      declaredCheck(versionDeprecations, "version_deprecations_replacement"),
    ).toBe("replacement <> version");
  });
});
