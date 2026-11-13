import { pythonDetector, pythonRecognition } from "../checks/python-detector";
import { isPythonStandardLibrary } from "../checks/python-stdlib";
import { pythonSnippets } from "../snippets/python-snippets";
import type { SdkEntry } from "./sdk-entry";

/** The Python SDK. Dependencies are top-level package names, matched without regard to case. */
export const python: SdkEntry<"Python"> = {
  sdk: "Python",
  recognition: pythonRecognition,
  detector: pythonDetector,
  snippets: pythonSnippets,
  isStandardLibrary: isPythonStandardLibrary,
  normaliseDependency: (name) => name.toLowerCase(),
  display: {
    package: "temporalio",
    highlightLanguage: "python",
    activityFileName: "activities.py",
  },
};
