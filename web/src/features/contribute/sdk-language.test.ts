import { expect, test } from "vitest";
import { sdkLanguage } from "./sdk-language";

test.each([
  ["Python", "python"],
  ["TypeScript", "typescript"],
  [".NET", "csharp"],
] as const)("a %s activity is highlighted as %s", (sdk, language) => {
  expect(sdkLanguage(sdk)).toBe(language);
});
