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
    // Detection always reads a TypeScript activity as async. The sync wording is there so every
    // SDK answers both, and names no thread pool because the generated worker sets up none.
    runsAs: {
      sync: "Synchronous: the worker needs no special setup",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. Your worker needs no special setup to run it.",
      async:
        "This is an async activity. Your worker needs no special setup to run it.",
    },
  },
};
