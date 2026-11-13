import { SQLiteSyncDialect, getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, expectTypeOf, test } from "vitest";
import { sdks, storedSdks, versions, type Sdk, type StoredSdk } from "./schema";

const versionsSdkCheck = () => {
  const check = getTableConfig(versions).checks.find(
    ({ name }) => name === "versions_sdk",
  );
  if (check === undefined) {
    throw new Error("The storage schema has no versions_sdk check.");
  }
  return new SQLiteSyncDialect().sqlToQuery(check.value).sql;
};

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
