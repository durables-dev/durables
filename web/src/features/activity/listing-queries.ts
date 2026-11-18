import { api } from "@/lib/api-client";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse, type InferResponseType } from "hono/client";
import type { ListingAddress } from "./listing-address";

// The page is two queries (web/CONVENTIONS.md, ADR 0006): the version, whose fields never
// change, and the listing, whose description can. They are never merged into one request.

/** What the version read answers: its address, title, SDK and detected facts. */
export type VersionResponse = InferResponseType<
  (typeof api.api.activities)[":handle"][":name"]["versions"][":version"]["$get"],
  200
>;

/** One published version: its address, title, SDK and detected facts. */
export function versionQuery({ handle, name, version }: ListingAddress) {
  return queryOptions({
    queryKey: ["versions", handle, name, version],
    queryFn: () =>
      parseResponse(
        api.api.activities[":handle"][":name"].versions[":version"].$get({
          param: { handle, name, version },
        }),
      ),
  });
}

/** One listing: its versions, newest first, each with its own description (ADR 0015). */
export function listingQuery({ handle, name }: ListingAddress) {
  return queryOptions({
    queryKey: ["listings", handle, name],
    queryFn: () =>
      parseResponse(
        api.api.activities[":handle"][":name"].$get({
          param: { handle, name },
        }),
      ),
  });
}

/** What the listing read answers: removal from search, and each version's changeable state. */
export type ListingResponse = InferResponseType<
  (typeof api.api.activities)[":handle"][":name"]["$get"],
  200
>;
