import { http, HttpResponse, type JsonBodyType } from "msw";
import { worker } from "../../../test/worker";
import type { CheckedFacts, CheckResult } from "./check-result";
import type { Draft } from "./draft";

// A fake API for new-version mode, for ddieruf/charge-card. It answers the version and listing
// reads, the detection check, and the new-version publish, and keeps every publish body it was
// sent. Imported by tests only.

const versionPath = "/api/activities/:handle/:name/versions/:version";
const listingPath = "/api/activities/:handle/:name";
const publishPath = "/api/activities/:handle/:name/versions";

/** The base version's title and each version's description. */
export const baseTitle = "Charge card";
export const descriptions: Record<string, string> = {
  "2.0.0": "Charges a payment method through Stripe.",
  "1.1.0": "Charges a card through Stripe, failing declined cards at once.",
  "1.0.0": "Charges a card through Stripe.",
};

/** The facts every version of the listing was published with. */
export const baseFacts: CheckedFacts = {
  sdk: "Python",
  activity: { name: "charge_card", line: 26 },
  input: "ChargeRequest",
  output: "ChargeResult",
  runsAs: "sync",
  nonRetryableErrors: [],
  configurationRead: [{ name: "STRIPE_API_KEY", line: 8 }],
  dependencies: [{ name: "stripe", line: 4 }],
  heartbeats: [],
};

/** The new code, as pasted. */
export const newCode = [
  "from temporalio import activity",
  "",
  "@activity.defn",
  "def charge_card(input: ChargeRequest) -> ChargeResult:",
  "    return charge(input)",
].join("\n");

/** A check of the new code that found the given facts. */
export function checkWith(facts: Partial<CheckedFacts> = {}): CheckResult {
  return { outcome: "accepted", facts: { ...baseFacts, ...facts } };
}

/** The base new-version mode starts from: ddieruf/charge-card@2.0.0, the latest. */
export const startFrom2 = {
  handle: "ddieruf",
  name: "charge-card",
  basedOn: "2.0.0",
};

/** A new-version draft with the new code accepted and Detected passed. */
export function detectedDraft(facts: Partial<CheckedFacts> = {}): Draft {
  return {
    finished: ["detected"],
    origin: "/ddieruf/charge-card@2.0.0",
    newVersion: startFrom2,
    code: newCode,
    check: checkWith(facts),
  };
}

export const allConfirmed = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
} as const;

/** A new-version draft ready to publish 2.1.0. */
export function reviewDraft(extra: Partial<Draft> = {}): Draft {
  return {
    ...detectedDraft(),
    finished: ["detected", "details"],
    details: { version: "2.1.0", whatChanged: "Retries use a fresh key." },
    confirmations: allConfirmed,
    ...extra,
  };
}

export interface NewVersionServerOptions {
  /** Newest first. */
  versions?: string[];
  removedBy?: "publisher" | null;
  /** What the check answers for any code. */
  check?: CheckResult;
  /** What publishing answers. A 201 with the new address unless given. */
  publish?: (body: { version: string }) => Response;
}

/** A refusal as the API answers it. */
export function problem(status: number, type = "about:blank", extra = {}) {
  return HttpResponse.json(
    { type, title: "Refused", status, ...extra },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

/** Serves ddieruf/charge-card for new-version mode. Returns the publish bodies it received. */
export function serveNewVersion({
  versions = ["2.0.0", "1.1.0", "1.0.0"],
  removedBy = null,
  check = checkWith(),
  publish,
}: NewVersionServerOptions = {}) {
  const published: unknown[] = [];
  const listing = (): JsonBodyType => ({
    handle: "ddieruf",
    name: "charge-card",
    removedBy,
    chips: [],
    versions: versions.map((version, index) => ({
      version,
      publishedAt: new Date().toISOString(),
      whatChanged: index === versions.length - 1 ? null : `Changed ${version}.`,
      basedOn: versions[index + 1] ?? null,
      deprecation: null,
      description: descriptions[version] ?? "A description.",
    })),
  });

  worker.use(
    http.get(versionPath, ({ params }) => {
      const version = String(params["version"]);
      if (!versions.includes(version)) return problem(404);
      return HttpResponse.json({
        address: `ddieruf/charge-card@${version}`,
        handle: "ddieruf",
        name: "charge-card",
        version,
        title: baseTitle,
        sdk: "Python",
        facts: baseFacts,
        code: "def charge_card(): ...",
        activityFileName: "activities.py",
        snippets: [],
        integrations: [],
        publishedAt: new Date().toISOString(),
      });
    }),
    http.get(listingPath, () => HttpResponse.json(listing())),
    http.post("/api/checks", () =>
      check.outcome === "accepted"
        ? HttpResponse.json(check.facts)
        : problem(422, check.problem.type),
    ),
    http.post(publishPath, async ({ request }) => {
      const body = (await request.json()) as { version: string };
      published.push(body);
      if (publish !== undefined) return publish(body);
      return HttpResponse.json(
        {
          address: `ddieruf/charge-card@${body.version}`,
          handle: "ddieruf",
          name: "charge-card",
          version: body.version,
          location: `/api/activities/ddieruf/charge-card/versions/${body.version}`,
          accountCreated: false,
        },
        { status: 201 },
      );
    }),
  );
  return { published };
}
