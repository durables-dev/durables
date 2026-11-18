import { problemFrom } from "@/lib/problem";
import { listingQuery, versionQuery } from "@/lib/listing-queries";
import type { NewVersionBase } from "@/lib/new-version-entry";
import { useQuery } from "@tanstack/react-query";
import { baseVersion, type BaseVersion } from "./new-version";

/** Where the read of a new version's base got to. */
export type BaseVersionRead =
  | { status: "pending" }
  | { status: "ready"; base: BaseVersion }
  /** The listing, or the version in it, does not exist. */
  | { status: "notFound" }
  | { status: "failed"; retrying: boolean; retry: () => void };

/**
 * Reads the base version and its listing, as the Activity page reads them (ADR 0006): two
 * queries, never merged. A base opened from its Activity page is already cached.
 */
export function useBaseVersion(base: NewVersionBase): BaseVersionRead {
  const address = { ...base, version: base.basedOn };
  const version = useQuery(versionQuery(address));
  const listing = useQuery(listingQuery(address));

  if (
    problemFrom(version.error)?.status === 404 ||
    problemFrom(listing.error)?.status === 404
  ) {
    return { status: "notFound" };
  }
  if (version.isError || listing.isError) {
    return {
      status: "failed",
      retrying: version.isFetching || listing.isFetching,
      retry: () => {
        if (version.isError) void version.refetch();
        if (listing.isError) void listing.refetch();
      },
    };
  }
  if (version.data === undefined || listing.data === undefined) {
    return { status: "pending" };
  }
  const read = baseVersion(base, version.data, listing.data);
  return read === undefined
    ? { status: "notFound" }
    : { status: "ready", base: read };
}
