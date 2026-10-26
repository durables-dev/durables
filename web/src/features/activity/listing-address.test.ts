import { reservedHandles } from "@durables/schemas";
import { describe, expect, test } from "vitest";
import { parseListingAddress } from "./listing-address";

describe("parseListingAddress", () => {
  test("reads the handle, the name and the version", () => {
    expect(
      parseListingAddress({
        handle: "ddieruf",
        nameAtVersion: "charge-card@1.0.0",
      }),
    ).toEqual({ handle: "ddieruf", name: "charge-card", version: "1.0.0" });
  });

  test("reads a version with more than one digit in a part", () => {
    expect(
      parseListingAddress({ handle: "ddieruf", nameAtVersion: "post@12.0.10" }),
    ).toEqual({ handle: "ddieruf", name: "post", version: "12.0.10" });
  });

  test.each([...reservedHandles])(
    "refuses the reserved handle %s, so its site page is never a listing",
    (handle) => {
      expect(
        parseListingAddress({ handle, nameAtVersion: "charge-card@1.0.0" }),
      ).toBeUndefined();
    },
  );

  test.each([
    ["no version", "ddieruf", "charge-card"],
    ["an empty version", "ddieruf", "charge-card@"],
    ["an empty name", "ddieruf", "@1.0.0"],
    ["a version that is not three numbers", "ddieruf", "charge-card@1.0"],
    ["a version with a leading zero", "ddieruf", "charge-card@01.0.0"],
    ["a version with a label", "ddieruf", "charge-card@1.0.0-beta"],
    ["two @ signs", "ddieruf", "charge-card@1.0.0@2.0.0"],
    ["a name with uppercase", "ddieruf", "Charge-card@1.0.0"],
    ["a name with an underscore", "ddieruf", "charge_card@1.0.0"],
    ["a handle with uppercase", "DDieruf", "charge-card@1.0.0"],
    ["a handle that breaks the format", "d", "charge-card@1.0.0"],
  ])("refuses an address with %s", (_case, handle, nameAtVersion) => {
    expect(parseListingAddress({ handle, nameAtVersion })).toBeUndefined();
  });

  test("refuses params with a part missing", () => {
    expect(parseListingAddress({ handle: "ddieruf" })).toBeUndefined();
    expect(
      parseListingAddress({ nameAtVersion: "charge-card@1.0.0" }),
    ).toBeUndefined();
  });
});
