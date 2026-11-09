import type { api } from "@/lib/api-client";
import type { InferResponseType } from "hono/client";

/** A batch of results, as the browse read answers it. */
export type BrowseResponse = InferResponseType<
  typeof api.api.activities.$get,
  200
>;

/** One result: a listing, shown at its highest version number. */
export type ActivityCard = BrowseResponse["activities"][number];
