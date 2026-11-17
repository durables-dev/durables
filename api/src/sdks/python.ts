import { pythonDetector, pythonRecognition } from "../checks/python-detector";
import { isPythonStandardLibrary } from "../checks/python-stdlib";
import { pythonSnippets } from "../snippets/python-snippets";
import logo from "./logos/python.svg";
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
    runsAs: {
      sync: "Synchronous: the worker needs a thread pool",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. Your worker needs a thread pool to run it, which the worker file in Implement already sets up.",
      async:
        "This is an async activity. Your worker needs no special setup to run it.",
    },
    logo,
  },
};
