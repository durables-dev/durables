import { api } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { ListingAddress } from "./listing-address";
import { listingQuery } from "./listing-queries";

/**
 * The root of every cached browse result. The search feature keys each search under it
 * (search: browse-query). Features never import from each other, so the key is named here.
 */
const browseResultsKey = ["activities"] as const;

/**
 * Saves the listing's one-line description. The answer is the listing, so it replaces the
 * page's listing query at once and the page shows it without reading it again. Cached browse
 * results are dropped, so search shows the new text in the same visit (ADR 0006).
 */
export function useSaveDescription(address: ListingAddress) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (description: string) =>
      parseResponse(
        api.api.activities[":handle"][":name"].$patch({
          param: { handle: address.handle, name: address.name },
          json: { description },
        }),
      ),
    onSuccess: (listing) => {
      queryClient.setQueryData(listingQuery(address).queryKey, listing);
      queryClient.removeQueries({ queryKey: browseResultsKey });
    },
  });
}
