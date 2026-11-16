import { catalogSdks, type SdkCatalog } from "@/lib/sdk-catalog";

// The SDK catalog component tests are served by default: the api's profiles for the three
// SDKs it accepted before the catalog, in chip order. A test that needs another SDK, or a
// failing catalog, overrides the handler with worker.use().

export const testCatalog: SdkCatalog = [
  {
    name: "Python",
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
  },
  {
    name: "TypeScript",
    package: "@temporalio/activity",
    highlightLanguage: "typescript",
    activityFileName: "activities.ts",
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
  {
    name: ".NET",
    package: "Temporalio",
    highlightLanguage: "csharp",
    activityFileName: "Activities.cs",
    runsAs: {
      sync: "Synchronous: the .NET SDK runs it for you",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. The .NET SDK runs it for you, so your worker needs no special setup.",
      async:
        "This is an async activity. Your worker needs no special setup to run it.",
    },
  },
];

/** The default catalog's SDK names, in chip order, as the /search route reads an address. */
export const testCatalogSdks = catalogSdks(testCatalog);
