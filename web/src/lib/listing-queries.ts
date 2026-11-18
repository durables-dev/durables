import { api } from "./api-client";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse, type InferResponseType } from "hono/client";

// The Activity page is two queries (web/CONVENTIONS.md, ADR 0006): the version, whose fields
// never change, and the listing, whose description can. They are never merged into one request.
// Contribute's new-version mode reads the same two, so a base opened from its page is cached.

/** Where a published version lives: `handle/name@version`. */
export interface VersionAddress {
  handle: string;
  name: string;
  version: string;
}

/** What the version read answers: its address, title, SDK and detected facts. */
export type VersionResponse = InferResponseType<
  (typeof api.api.activities)[":handle"][":name"]["versions"][":version"]["$get"],
  200
>;

/** One published version: its address, title, SDK and detected facts. */
export function versionQuery({ handle, name, version }: VersionAddress) {
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
export function listingQuery({
  handle,
  name,
}: Omit<VersionAddress, "version">) {
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
