import { api } from "@/lib/api-client";
import type { Search } from "@/lib/search-address";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

/** Where the browse read starts: no cursor, the first batch. */
const firstBatch: string | null = null;

/**
 * The results for one search, read in batches of 50 from the browse endpoint. Each search is
 * its own query, so changing the words or filters starts again at the first batch, and an
 * answer for an older search never lands in the newer one.
 */
export function browseQuery({ words, sdks, integrations, publisher }: Search) {
  return infiniteQueryOptions({
    queryKey: ["activities", { words, sdks, integrations, publisher }],
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        api.api.activities.$get(
          {
            query: {
              q: words === "" ? undefined : words,
              sdk: [...sdks],
              chip: [...integrations],
              publisher,
              cursor: pageParam ?? undefined,
            },
          },
          { init: { signal } },
        ),
      ),
    initialPageParam: firstBatch,
    getNextPageParam: (batch) => batch.nextCursor,
  });
}
