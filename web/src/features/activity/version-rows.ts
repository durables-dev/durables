import type { ListingResponse } from "@/lib/listing-queries";

/** One version as the listing read answers it. */
export type ListingVersion = ListingResponse["versions"][number];

/** What one row of the Versions section shows. */
export interface VersionRow {
  version: string;
  /** True for the newest version, which shows "· latest". */
  latest: boolean;
  publishedAt: string;
  /** The What changed note, or "First release." for a version published without one. */
  note: string;
  /** "Based on {version}", or "First version". */
  lineage: string;
  /** "Deprecated · use {version}" or "Deprecated · no replacement". Null when not deprecated. */
  deprecated: string | null;
  /** True for the version being viewed, which shows "Viewing" instead of a link. */
  viewing: boolean;
}

/** The note a version published without one shows. Only a first version has none. */
export const firstReleaseNote = "First release.";

/**
 * The Versions section's rows, newest first, as the listing read orders them. The first is the
 * latest.
 */
export function versionRows(
  versions: readonly ListingVersion[],
  viewed: string,
): VersionRow[] {
  return versions.map((entry, index) => ({
    version: entry.version,
    latest: index === 0,
    publishedAt: entry.publishedAt,
    note: entry.whatChanged ?? firstReleaseNote,
    lineage:
      entry.basedOn === null ? "First version" : `Based on ${entry.basedOn}`,
    deprecated:
      entry.deprecation === null
        ? null
        : entry.deprecation.replacement === null
          ? "Deprecated · no replacement"
          : `Deprecated · use ${entry.deprecation.replacement}`,
    viewing: entry.version === viewed,
  }));
}

/**
 * The latest version, when the viewed one is older and not deprecated, so the page shows the
 * older-version notice. Undefined on the latest version, on a deprecated one, which has its
 * own notice, and on a version the listing does not hold.
 */
export function latestForOlderVersion(
  versions: readonly ListingVersion[],
  viewed: string,
): string | undefined {
  const [latest] = versions;
  const entry = versions.find(({ version }) => version === viewed);
  if (latest === undefined || entry === undefined) return undefined;
  if (entry.version === latest.version || entry.deprecation !== null) {
    return undefined;
  }
  return latest.version;
}
