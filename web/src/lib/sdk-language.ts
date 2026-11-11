import type { Sdk } from "@durables/schemas";
import type { CodeLanguage } from "./highlighter";

const languages: Readonly<Record<Sdk, CodeLanguage>> = {
  Python: "python",
  TypeScript: "typescript",
  ".NET": "csharp",
};

/** The language an activity's code is highlighted in, from its SDK. */
export function sdkLanguage(sdk: Sdk): CodeLanguage {
  return languages[sdk];
}
