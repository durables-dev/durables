import { describe, expect, test } from "vitest";
import { versionDocumentKey } from "./version-document";

describe("the version document key", () => {
  const address = { handle: "ddieruf", name: "charge-card", version: "1.0.0" };

  test("is built from the address", () => {
    expect(versionDocumentKey(address)).toBe(
      "versions/ddieruf/charge-card@1.0.0.json",
    );
  });

  test.each([
    ["handle", { ...address, handle: "someone-else" }],
    ["name", { ...address, name: "refund-card" }],
    ["version", { ...address, version: "1.0.1" }],
  ])("differs when only the %s differs", (_part, other) => {
    expect(versionDocumentKey(other)).not.toBe(versionDocumentKey(address));
  });

  test("keeps addresses apart when a part holds a separator", () => {
    const keys = [
      { handle: "a/b", name: "c", version: "1.0.0" },
      { handle: "a", name: "b/c", version: "1.0.0" },
      { handle: "a", name: "b@c", version: "1.0.0" },
      { handle: "a", name: "b", version: "c@1.0.0" },
    ].map(versionDocumentKey);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
