import { http, HttpResponse } from "msw";
import { testCatalog } from "./sdk-catalog";
import { worker } from "./worker";

// Overrides of the default SDK catalog for component tests. The catalog is JSON on the wire,
// so a test can serve an SDK the api's types do not name yet, as a new api would.

/** A profile for an SDK web has no code for, shaped as the api answers it. */
export const rustProfile = {
  name: "Rust",
  package: "temporalio-sdk",
  highlightLanguage: "rust",
  activityFileName: "activities.rs",
  runsAs: {
    sync: "Synchronous: the worker needs no special setup",
    async: "Async",
  },
  workerRequirements: {
    sync: "This is a synchronous activity. Your Rust worker needs no special setup to run it.",
    async:
      "This is an async activity. Your Rust worker needs no special setup to run it.",
  },
};

/** The eight SDKs in Temporal's order, each with a profile, as the api will answer. */
export const eightSdks = [
  "Go",
  "Java",
  "Python",
  "TypeScript",
  ".NET",
  "Ruby",
  "PHP",
  "Rust",
] as const;

/** A catalog of the eight SDKs, in Temporal's order. */
export const eightSdkCatalog = eightSdks.map(
  (name) =>
    testCatalog.find((profile) => profile.name === name) ?? {
      ...rustProfile,
      name,
    },
);

/** Serves `catalog` as the SDK catalog. */
export function serveCatalog(catalog: readonly unknown[]) {
  worker.use(http.get("/api/sdks", () => HttpResponse.json(catalog)));
}

/**
 * Answers the SDK catalog read with a 500 Problem Details. Resolves once the failure has
 * reached the page and the page has had a turn to show it.
 */
export function failCatalog(): Promise<void> {
  return new Promise((resolve) => {
    worker.use(
      http.get("/api/sdks", () => {
        setTimeout(resolve, 50);
        return HttpResponse.json(
          { type: "about:blank", title: "Internal Server Error", status: 500 },
          {
            status: 500,
            headers: { "Content-Type": "application/problem+json" },
          },
        );
      }),
    );
  });
}

/**
 * Holds the SDK catalog read open, so the page stays as it is while the catalog loads.
 * Returns what answers it with the default catalog. A test calls it before it ends.
 */
export function holdCatalog(): () => void {
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  worker.use(
    http.get("/api/sdks", async () => {
      await answered;
      return HttpResponse.json(testCatalog);
    }),
  );
  return answer;
}
