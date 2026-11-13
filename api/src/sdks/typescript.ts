import { isNodeBuiltin } from "../checks/node-builtins";
import {
  typescriptDetector,
  typescriptRecognition,
} from "../checks/typescript-detector";
import { typescriptSnippets } from "../snippets/typescript-snippets";
import type { SdkEntry } from "./sdk-entry";

/** The TypeScript SDK. Dependencies are npm package names, matched without regard to case. */
export const typescript: SdkEntry<"TypeScript"> = {
  sdk: "TypeScript",
  recognition: typescriptRecognition,
  detector: typescriptDetector,
  snippets: typescriptSnippets,
  isStandardLibrary: isNodeBuiltin,
  normaliseDependency: (name) => name.toLowerCase(),
  display: {
    // The SDK ships as several @temporalio packages. Published activity code imports this one.
    package: "@temporalio/activity",
    highlightLanguage: "typescript",
    activityFileName: "activities.ts",
  },
};
