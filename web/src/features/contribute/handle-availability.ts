import { api } from "@/lib/api-client";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse, type InferResponseType } from "hono/client";

/** What the availability check answers for one handle. */
export type HandleAvailabilityResponse = InferResponseType<
  typeof api.api.handles.availability.$get,
  200
>;

/**
 * The availability check for one handle. Each handle is its own query, so only the answer for
 * the handle in the field is ever shown, however the requests finish.
 */
export function handleAvailabilityQuery(handle: string) {
  return queryOptions({
    queryKey: ["handles", "availability", handle],
    queryFn: () =>
      parseResponse(api.api.handles.availability.$get({ query: { handle } })),
  });
}
