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
  },
};
