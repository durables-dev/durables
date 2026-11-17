import {
  goDetector,
  goRecognition,
  isGoStandardLibrary,
  normaliseGoDependency,
} from "../checks/go-detector";
import { goSnippets } from "../snippets/go-snippets";
import logo from "./logos/go.svg";
import type { SdkEntry } from "./sdk-entry";

/**
 * The Go SDK. Dependencies are import paths, matched on the path before any major-version
 * suffix, without regard to case.
 */
export const go: SdkEntry<"Go"> = {
  sdk: "Go",
  recognition: goRecognition,
  detector: goDetector,
  snippets: goSnippets,
  isStandardLibrary: isGoStandardLibrary,
  normaliseDependency: normaliseGoDependency,
  display: {
    package: "go.temporal.io/sdk",
    highlightLanguage: "go",
    activityFileName: "activity.go",
    // The Go SDK calls each activity on its own goroutine, and the generated worker sets up no
    // executor, so neither sentence names a thread pool.
    runsAs: {
      sync: "Synchronous: the Go SDK runs it for you",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. The Go SDK runs it for you, so your worker needs no special setup.",
      async:
        "This is an async activity. Your worker needs no special setup to run it.",
    },
    logo,
  },
};
