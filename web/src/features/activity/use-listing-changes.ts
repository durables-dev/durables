import { api } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { browseResultsKey } from "./browse-results-key";
import type { ListingAddress } from "./listing-address";
import { listingQuery, type ListingResponse } from "@/lib/listing-queries";

// The publisher bar's changes to a listing: deprecating the viewed version or undoing it, and
// taking the activity out of search or returning it. Each answers with the listing, which
// replaces the page's listing query at once, so the notices change without a second read
// (ADR 0006).

/** Writes the answered listing into the page's listing query. */
function useWriteListing(address: ListingAddress) {
  const queryClient = useQueryClient();
  return (listing: ListingResponse) => {
    queryClient.setQueryData(listingQuery(address).queryKey, listing);
  };
}

/** Writes the answered listing, and drops cached browse results, which a removal changes. */
function useWriteListingAndBrowse(address: ListingAddress) {
  const queryClient = useQueryClient();
  const writeListing = useWriteListing(address);
  return (listing: ListingResponse) => {
    writeListing(listing);
    queryClient.removeQueries({ queryKey: browseResultsKey });
  };
}

export interface DeprecationRequest {
  /** The trimmed reason. */
  reason: string;
  /** Another version of the listing, or null for no replacement. */
  replacement: string | null;
}

/** Deprecates the viewed version with a reason and an optional replacement. */
export function useDeprecate(address: ListingAddress) {
  const onSuccess = useWriteListing(address);
  return useMutation({
    mutationFn: (json: DeprecationRequest) =>
      parseResponse(
        api.api.activities[":handle"][":name"].versions[
          ":version"
        ].deprecation.$put({ param: address, json }),
      ),
    onSuccess,
  });
}

/** Undoes the viewed version's deprecation. */
export function useUndoDeprecation(address: ListingAddress) {
  const onSuccess = useWriteListing(address);
  return useMutation({
    mutationFn: () =>
      parseResponse(
        api.api.activities[":handle"][":name"].versions[
          ":version"
        ].deprecation.$delete({ param: address }),
      ),
    onSuccess,
  });
}

/** Takes every version of the activity out of search. */
export function useRemoveFromSearch(address: ListingAddress) {
  const onSuccess = useWriteListingAndBrowse(address);
  return useMutation({
    mutationFn: () =>
      parseResponse(
        api.api.activities[":handle"][":name"].removal.$put({
          param: { handle: address.handle, name: address.name },
        }),
      ),
    onSuccess,
  });
}

/** Returns the activity to search. */
export function useReturnToSearch(address: ListingAddress) {
  const onSuccess = useWriteListingAndBrowse(address);
  return useMutation({
    mutationFn: () =>
      parseResponse(
        api.api.activities[":handle"][":name"].removal.$delete({
          param: { handle: address.handle, name: address.name },
        }),
      ),
    onSuccess,
  });
}
