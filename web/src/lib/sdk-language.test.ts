import { sdks } from "@durables/schemas";
import { expect, test } from "vitest";
import { sdkLanguage } from "./sdk-language";

test("the shared SDK list holds exactly Python, TypeScript and .NET", () => {
  expect(sdks).toEqual(["Python", "TypeScript", ".NET"]);
});

test.each([
  ["Python", "python"],
  ["TypeScript", "typescript"],
  [".NET", "csharp"],
] as const)("%s code is highlighted as %s", (sdk, language) => {
  expect(sdkLanguage(sdk)).toBe(language);
});

test("every SDK on the shared list has a language", () => {
  expect(sdks.map(sdkLanguage)).toEqual(["python", "typescript", "csharp"]);
});
