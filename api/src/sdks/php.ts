import { isPhpBuiltin } from "../checks/php-builtins";
import { phpDetector, phpRecognition } from "../checks/php-detector";
import { phpActivityFileName, phpSnippets } from "../snippets/php-snippets";
import type { SdkEntry } from "./sdk-entry";

/**
 * The PHP SDK. Dependencies are package-level namespaces, such as `Aws\S3`, matched without
 * regard to case, as PHP compares namespaces.
 */
export const php: SdkEntry<"PHP"> = {
  sdk: "PHP",
  recognition: phpRecognition,
  detector: phpDetector,
  snippets: phpSnippets,
  isStandardLibrary: isPhpBuiltin,
  normaliseDependency: (name) => name.toLowerCase(),
  display: {
    package: "temporal/sdk",
    highlightLanguage: "php",
    activityFileName: phpActivityFileName,
    // RoadRunner runs each activity in a PHP worker process. The generated worker sets up no
    // thread pool, so neither sentence names one. Detection always reads a PHP activity as
    // synchronous; the async wording is there so every SDK answers both.
    runsAs: {
      sync: "Synchronous: RoadRunner runs it in a PHP worker process",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. Your worker runs under RoadRunner, which needs PHP's grpc extension. The .rr.yaml file in Implement configures it.",
      async:
        "This is an async activity. Your worker runs under RoadRunner, which needs PHP's grpc extension. The .rr.yaml file in Implement configures it.",
    },
  },
};
