import { http, HttpResponse, type JsonBodyType } from "msw";
import { worker } from "../../../test/worker";
import { python } from "./test-versions";

// A fake listing API for ddieruf/charge-card that keeps its state between requests, for the
// publisher bar's and the Versions section's tests. It answers the version read at any of the
// listing's versions, and the listing read, description save, deprecation and removal routes
// as the API does.

const versionPath = "/api/activities/:handle/:name/versions/:version";
const listingPath = "/api/activities/:handle/:name";
const deprecationPath = `${versionPath}/deprecation`;
const removalPath = `${listingPath}/removal`;

export const chargeCardDescription =
  "Charges a card with Stripe and returns the charge ID.";

export interface TestDeprecation {
  reason: string;
  replacement: string | null;
}

/** What the listing read says about one version, beyond its number and deprecation. */
export interface TestVersionDetails {
  whatChanged?: string;
  basedOn?: string;
  description?: string;
  publishedAt?: string;
}

export interface TestListingState {
  removedBy: "publisher" | "durables" | null;
  /** Newest first. */
  versions: string[];
  deprecations: Record<string, TestDeprecation>;
  /** Each version's note, base, description and date. Unset fields take the defaults. */
  details: Record<string, TestVersionDetails>;
  /** The listing's chips, patterns included, as the listing read answers them. */
  chips: string[];
}

/** A write the fake API received, with its method, route and body. */
export interface TestWrite {
  method: string;
  path: string;
  body?: unknown;
}

const problemHeaders = { "Content-Type": "application/problem+json" };

/** A refusal as the API answers it. */
export function problem(status: number, extra: object = {}) {
  return HttpResponse.json(
    { type: "about:blank", title: "Refused", status, ...extra },
    { status, headers: problemHeaders },
  );
}

function versionResponse(version: string) {
  return {
    address: `ddieruf/charge-card@${version}`,
    handle: "ddieruf",
    name: "charge-card",
    version,
    title: "Charge card",
    sdk: "Python",
    facts: {
      activity: { name: "charge_card", line: 26 },
      input: "ChargeRequest",
      output: "ChargeResult",
      runsAs: "sync",
      nonRetryableErrors: [],
      configurationRead: [{ name: "STRIPE_API_KEY", line: 8 }],
      dependencies: [{ name: "stripe", line: 4 }],
      heartbeats: [],
    },
    code: python.code,
    activityFileName: "activities.py",
    snippets: python.snippets,
    integrations: [],
    publishedAt: new Date().toISOString(),
  };
}

/**
 * Serves ddieruf/charge-card with the given state, which the write routes change as the API
 * would. Returns the state, so a test can read it, and the writes received.
 */
export function serveChargeCard(initial: Partial<TestListingState> = {}) {
  const state: TestListingState = {
    removedBy: null,
    versions: ["1.0.0"],
    deprecations: {},
    details: {},
    chips: [],
    ...initial,
  };
  const writes: TestWrite[] = [];

  const listing = (): JsonBodyType => ({
    handle: "ddieruf",
    name: "charge-card",
    removedBy: state.removedBy,
    chips: state.chips,
    versions: state.versions.map((version) => {
      const details = state.details[version] ?? {};
      return {
        version,
        publishedAt: details.publishedAt ?? new Date().toISOString(),
        whatChanged: details.whatChanged ?? null,
        basedOn: details.basedOn ?? null,
        deprecation: state.deprecations[version] ?? null,
        description: details.description ?? chargeCardDescription,
      };
    }),
  });

  worker.use(
    http.get(versionPath, ({ params }) => {
      const version = String(params["version"]);
      return state.versions.includes(version)
        ? HttpResponse.json(versionResponse(version))
        : problem(404);
    }),
    http.get(listingPath, () => HttpResponse.json(listing())),
    http.patch(listingPath, async ({ request }) => {
      const body = (await request.json()) as {
        version: string;
        description: string;
      };
      writes.push({ method: "PATCH", path: "description", body });
      if (!state.versions.includes(body.version)) return problem(404);
      state.details[body.version] = {
        ...state.details[body.version],
        description: body.description,
      };
      return HttpResponse.json(listing());
    }),
    http.put(deprecationPath, async ({ request, params }) => {
      const body = (await request.json()) as TestDeprecation;
      writes.push({ method: "PUT", path: "deprecation", body });
      state.deprecations[String(params["version"])] = {
        reason: body.reason,
        replacement: body.replacement,
      };
      return HttpResponse.json(listing());
    }),
    http.delete(deprecationPath, ({ params }) => {
      writes.push({ method: "DELETE", path: "deprecation" });
      state.deprecations = Object.fromEntries(
        Object.entries(state.deprecations).filter(
          ([version]) => version !== String(params["version"]),
        ),
      );
      return HttpResponse.json(listing());
    }),
    http.put(removalPath, () => {
      writes.push({ method: "PUT", path: "removal" });
      state.removedBy = "publisher";
      return HttpResponse.json(listing());
    }),
    http.delete(removalPath, () => {
      writes.push({ method: "DELETE", path: "removal" });
      state.removedBy = null;
      return HttpResponse.json(listing());
    }),
  );
  return { state, writes };
}

/** Makes a write route refuse every request with the given status. */
export function refuse(
  method: "put" | "delete",
  route: "deprecation" | "removal",
  status: number,
) {
  const path = route === "deprecation" ? deprecationPath : removalPath;
  worker.use(http[method](path, () => problem(status)));
}

/** Makes the description save refuse every request with the given status. */
export function refuseDescription(status: number) {
  worker.use(http.patch(listingPath, () => problem(status)));
}
