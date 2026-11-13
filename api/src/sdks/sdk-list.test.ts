import { describe, expect, expectTypeOf, it } from "vitest";
import { sdkRegistry } from "./registry";
import type { SdkRegistry } from "./sdk-entry";
import { type Sdk, sdkSchema, sdks } from "./sdk-list";

describe("the api's SDK list", () => {
  it("holds Python, TypeScript, .NET and Ruby, in that order", () => {
    expect(sdks).toEqual(["Python", "TypeScript", ".NET", "Ruby"]);
  });

  it("keys the registry, so each SDK in it needs an entry", () => {
    // Checked by `npm run typecheck`: a name added to the list without an entry fails the build.
    expectTypeOf<keyof SdkRegistry>().toEqualTypeOf<Sdk>();
    expect(Object.keys(sdkRegistry).sort()).toEqual([...sdks].sort());
  });

  it.each(sdks)("accepts %s", (sdk) => {
    expect(sdkSchema.parse(sdk)).toBe(sdk);
  });

  it.each(["Go", "Java", "python", "", ".net", "ruby"])(
    "refuses %j, which is not in the list",
    (name) => {
      expect(sdkSchema.safeParse(name).success).toBe(false);
    },
  );
});
