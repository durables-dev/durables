import type { CodeLanguage } from "./highlighter";

/** The Temporal SDKs an activity can be written for, as the API names them. */
export type Sdk = "Python" | "TypeScript" | ".NET";

const languages: Readonly<Record<Sdk, CodeLanguage>> = {
  Python: "python",
  TypeScript: "typescript",
  ".NET": "csharp",
};

/** The language an activity's code is highlighted in, from its SDK. */
export function sdkLanguage(sdk: Sdk): CodeLanguage {
  return languages[sdk];
}
