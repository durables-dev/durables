import type { CodeLanguage } from "@/lib/highlighter";
import type { VersionResponse } from "./listing-queries";

const languages: Record<VersionResponse["sdk"], CodeLanguage> = {
  Python: "python",
  TypeScript: "typescript",
  ".NET": "csharp",
};

/** The language a version's code is highlighted in, from its SDK. */
export function sdkLanguage(sdk: VersionResponse["sdk"]): CodeLanguage {
  return languages[sdk];
}
