import {
  isJavaStandardLibrary,
  javaDetector,
  javaRecognition,
  normaliseJavaDependency,
} from "../checks/java-detector";
import { javaSnippets } from "../snippets/java-snippets";
import type { SdkEntry } from "./sdk-entry";

/**
 * The Java SDK. Dependencies are the packages imported from, and integrations are matched by
 * each package's organisation, or its AWS service.
 */
export const java: SdkEntry<"Java"> = {
  sdk: "Java",
  recognition: javaRecognition,
  detector: javaDetector,
  snippets: javaSnippets,
  isStandardLibrary: isJavaStandardLibrary,
  normaliseDependency: normaliseJavaDependency,
  display: {
    package: "io.temporal:temporal-sdk",
    highlightLanguage: "java",
    activityFileName: "Activities.java",
    // The SDK runs activities on the worker's own threads. The generated worker sets up
    // nothing for it, so neither sentence names a thread pool.
    runsAs: {
      sync: "Synchronous: the Java SDK runs it for you",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. The Java SDK runs it for you, so your worker needs no special setup.",
      async:
        "This is an async activity. Your worker needs no special setup to run it.",
    },
  },
};
