import type { ListingResponse, VersionResponse } from "@/lib/listing-queries";
import type { NewVersionBase } from "@/lib/new-version-entry";
import {
  compareVersionNumbers,
  versionNotHigherMessage,
  versionNumberFormatMessage,
  versionNumberSchema,
  versionTakenMessage,
} from "@durables/schemas";
import type { CheckedFacts } from "./check-result";

// New-version mode: the version a new one starts from, the number the Details step suggests,
// and what it says about the number typed. The suggestion is made here in the browser from the
// new code and the base version. Publishing still enforces the number rules.

/** The base version and its listing, as new-version mode reads them. */
export interface BaseVersion extends NewVersionBase {
  /** The base version's title, which the new version's title starts from. */
  title: string;
  /** The base version's current one-line description, which the new one starts from. */
  description: string;
  /** The base version's activity name and its input and output types. */
  activity: {
    name: string;
    input: string | null;
    output: string | null;
  };
  /** Every version of the listing, newest first. */
  versions: readonly string[];
  /** The listing's latest version. */
  latest: string;
  /** The listing is out of search. Publishing a new version returns it. */
  removed: boolean;
}

/**
 * The base version from its version read and its listing read. Undefined when the listing
 * holds no such version.
 */
export function baseVersion(
  base: NewVersionBase,
  version: VersionResponse,
  listing: ListingResponse,
): BaseVersion | undefined {
  const entry = listing.versions.find(
    ({ version: each }) => each === base.basedOn,
  );
  const [latest] = listing.versions;
  if (entry === undefined || latest === undefined) return undefined;
  return {
    ...base,
    title: version.title,
    description: entry.description,
    activity: {
      name: version.facts.activity.name,
      input: version.facts.input,
      output: version.facts.output,
    },
    versions: listing.versions.map(({ version: each }) => each),
    latest: latest.version,
    removed: listing.removedBy !== null,
  };
}

/** The number the Details step suggests, and why. */
export interface VersionSuggestion {
  version: string;
  /** True when the new code changes what callers rely on, so a major version is suggested. */
  major: boolean;
  why: string;
}

/**
 * The suggested number: the next major version after the latest when the activity name, input
 * type or output type differs from the base version, and otherwise the next minor one. Without
 * accepted code there is nothing to compare, so the suggestion is minor.
 */
export function suggestVersion(
  base: BaseVersion,
  facts: CheckedFacts | undefined,
): VersionSuggestion {
  const [major = 0, minor = 0] = base.latest.split(".").map(Number);
  if (facts === undefined) {
    return {
      version: `${major}.${minor + 1}.0`,
      major: false,
      why: `Paste the code first, and the suggestion compares it with ${base.basedOn}.`,
    };
  }
  const breaking =
    facts.activity.name !== base.activity.name ||
    facts.input !== base.activity.input ||
    facts.output !== base.activity.output;
  return breaking
    ? {
        version: `${major + 1}.0.0`,
        major: true,
        why: `The activity name or its input or output type differs from ${base.basedOn}, which breaks callers.`,
      }
    : {
        version: `${major}.${minor + 1}.0`,
        major: false,
        why: `The name, input and output types match ${base.basedOn}, so callers keep working.`,
      };
}

export const saferMajorMessage =
  "✓ Allowed, but the input or output changed, so a major version is safer.";

/** What the Details step says about the version typed. */
export type VersionCheck =
  /** Nothing typed yet. The suggestion shows as the field's placeholder. */
  | { kind: "empty" }
  | { kind: "malformed"; message: string }
  | { kind: "taken"; message: string }
  | { kind: "notHigher"; message: string }
  /** Allowed, though the suggestion is a major version and this is not one. */
  | { kind: "saferMajor"; message: string }
  | { kind: "available"; message: string };

/**
 * The message for the version typed: the shared number rule, then a version the listing
 * already has, then one not higher than the latest, as publishing checks them. A number that
 * passes is available, with a note when a major version would be safer.
 */
export function checkVersion(
  typed: string,
  base: BaseVersion,
  suggestion: VersionSuggestion,
): VersionCheck {
  if (typed === "") return { kind: "empty" };
  if (!versionNumberSchema.safeParse(typed).success) {
    return { kind: "malformed", message: versionNumberFormatMessage };
  }
  if (base.versions.includes(typed)) {
    return { kind: "taken", message: versionTakenMessage(typed) };
  }
  if (compareVersionNumbers(typed, base.latest) <= 0) {
    return { kind: "notHigher", message: versionNotHigherMessage(base.latest) };
  }
  const [typedMajor] = typed.split(".").map(Number);
  const [latestMajor] = base.latest.split(".").map(Number);
  if (suggestion.major && typedMajor === latestMajor) {
    return { kind: "saferMajor", message: saferMajorMessage };
  }
  return { kind: "available", message: `✓ ${typed} is available.` };
}

/** The version typed can be published. */
export function versionAllowed(check: VersionCheck): boolean {
  return check.kind === "available" || check.kind === "saferMajor";
}

/** The reason the deprecation of the base starts with, naming the new version. */
export function replacedByReason(version: string): string {
  return `Replaced by ${version}`;
}
