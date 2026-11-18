import { describe, expect, test } from "vitest";
import {
  newVersionEntryState,
  newVersionFromEntryState,
} from "./new-version-entry";

const base = { handle: "ddieruf", name: "charge-card", basedOn: "1.1.0" };

describe("newVersionEntryState", () => {
  test("names the base and the page the link sits on", () => {
    expect(
      newVersionEntryState(base, {
        pathname: "/ddieruf/charge-card@2.0.0",
        search: "",
      }),
    ).toEqual({ from: "/ddieruf/charge-card@2.0.0", newVersion: base });
  });
});

describe("newVersionFromEntryState", () => {
  test("reads the base back", () => {
    expect(
      newVersionFromEntryState({ from: "/x/y@1.0.0", newVersion: base }),
    ).toEqual(base);
  });

  test("is undefined when the state names no base", () => {
    expect(newVersionFromEntryState(null)).toBeUndefined();
    expect(newVersionFromEntryState({ from: "/search" })).toBeUndefined();
  });

  test.each([
    ["a version that breaks the number rule", { ...base, basedOn: "1.1" }],
    ["a name that breaks the name rule", { ...base, name: "Charge Card" }],
    ["a reserved handle", { ...base, handle: "contribute" }],
  ])("is undefined for %s", (_, newVersion) => {
    expect(newVersionFromEntryState({ newVersion })).toBeUndefined();
  });
});
