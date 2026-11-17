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
 * Returns what answers it with `catalog`, the default catalog unless given. A test calls it
 * before it ends.
 */
export function holdCatalog(
  catalog: readonly unknown[] = testCatalog,
): () => void {
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  worker.use(
    http.get("/api/sdks", async () => {
      await answered;
      return HttpResponse.json(catalog);
    }),
  );
  return answer;
}

/** A catalog profile for an SDK, shaped as the api answers it, naming its highlight language. */
export function profileFor(
  name: string,
  highlightLanguage: string,
  activityFileName: string,
) {
  return { ...rustProfile, name, highlightLanguage, activityFileName };
}

/** Where the api serves an SDK's logo. Tests name it only to answer it. */
export const logoPath = "/api/sdks/:name/logo.svg";

/** The colour the test logos are drawn in, as a canvas reads a pixel of it. */
export const testLogoColour = [0, 173, 216] as const;

/** An SVG logo of the given proportions, drawn in the test colour. */
export function testLogo(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}"><rect width="${String(width)}" height="${String(height)}" fill="rgb(${testLogoColour.join(",")})"/></svg>`;
}

// Each logo URL is new. A page reuses an image it has already loaded at a URL, without asking
// again, so a test that reused one would see the last test's logo.
let logoVersion = 0;

/**
 * A catalog profile carrying a logo, as the api answers it. The logo URL is the api's logo
 * route for the SDK, made unique with a query; `credit` and `lightTile` are added only when
 * given, as the api does.
 */
export function logoProfile(
  name: string,
  extra: { credit?: string; lightTile?: boolean } = {},
) {
  return {
    ...(testCatalog.find((profile) => profile.name === name) ?? {
      ...rustProfile,
      name,
    }),
    logoUrl: `/api/sdks/${encodeURIComponent(name)}/logo.svg?test=${String((logoVersion += 1))}`,
    ...extra,
  };
}

function svgResponse(svg: string) {
  return new HttpResponse(svg, {
    headers: { "Content-Type": "image/svg+xml" },
  });
}

/** Serves `svg` as every SDK's logo. */
export function serveLogo(svg: string) {
  worker.use(http.get(logoPath, () => svgResponse(svg)));
}

/** Answers every logo read with a 404 Problem Details, as the api does for a missing logo. */
export function failLogo() {
  worker.use(
    http.get(logoPath, () =>
      HttpResponse.json(
        { type: "about:blank", title: "Not Found", status: 404 },
        {
          status: 404,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
}

/**
 * Holds every logo read open, so the row stays as it is while the logo loads. Returns what
 * answers it with `svg`. A test calls it before it ends.
 */
export function holdLogo(svg: string): () => void {
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  worker.use(
    http.get(logoPath, async () => {
      await answered;
      return svgResponse(svg);
    }),
  );
  return answer;
}
