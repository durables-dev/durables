import type { CodeLanguage } from "@/lib/highlighter";
import type { CheckedFacts } from "./check-result";

const languages: Record<CheckedFacts["sdk"], CodeLanguage> = {
  Python: "python",
  TypeScript: "typescript",
  ".NET": "csharp",
};

/** The language an accepted file is highlighted in, from the SDK detection found. */
export function sdkLanguage(sdk: CheckedFacts["sdk"]): CodeLanguage {
  return languages[sdk];
}
