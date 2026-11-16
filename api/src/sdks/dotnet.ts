import {
  dotnetDetector,
  dotnetRecognition,
  isDotnetFrameworkNamespace,
} from "../checks/dotnet-detector";
import { dotnetSnippets } from "../snippets/dotnet-snippets";
import type { SdkEntry } from "./sdk-entry";

/**
 * The .NET SDK. Dependencies are the root namespace of a `using`, matched without regard to
 * case.
 */
export const dotnet: SdkEntry<".NET"> = {
  sdk: ".NET",
  recognition: dotnetRecognition,
  detector: dotnetDetector,
  snippets: dotnetSnippets,
  isStandardLibrary: isDotnetFrameworkNamespace,
  normaliseDependency: (name) => name.toLowerCase(),
  display: {
    package: "Temporalio",
    highlightLanguage: "csharp",
    activityFileName: "Activities.cs",
    runsAs: {
      // The generated worker sets up no thread pool, so neither sentence names one.
      sync: "Synchronous: the .NET SDK runs it for you",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. The .NET SDK runs it for you, so your worker needs no special setup.",
      async:
        "This is an async activity. Your worker needs no special setup to run it.",
    },
  },
};
