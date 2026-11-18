import { api } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { browseResultsKey } from "./browse-results-key";
import type { ListingAddress } from "./listing-address";
import { listingQuery } from "@/lib/listing-queries";

/**
 * Saves the viewed version's one-line description (ADR 0015); other versions keep theirs.
 * The answer is the listing, so it replaces the page's listing query at once and the page shows it without reading it again. Cached browse
 * results are dropped, so search shows the new text in the same visit (ADR 0006).
 */
export function useSaveDescription(address: ListingAddress) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (description: string) =>
      parseResponse(
        api.api.activities[":handle"][":name"].$patch({
          param: { handle: address.handle, name: address.name },
          json: { version: address.version, description },
        }),
      ),
    onSuccess: (listing) => {
      queryClient.setQueryData(listingQuery(address).queryKey, listing);
      queryClient.removeQueries({ queryKey: browseResultsKey });
    },
  });
}
