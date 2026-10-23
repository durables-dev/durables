import { Hono } from "hono";
import { cache } from "hono/cache";
import type { AppEnv } from "../app-env";
import {
  listingCacheControl,
  versionCacheControl,
  versionCacheName,
} from "../http/cache-control";
import { ProblemError } from "../http/problem";
import {
  formatAddress,
  listingResponse,
  versionResponse,
  type ListingResponse,
  type VersionResponse,
} from "./responses";

// Reading a published activity (ADR 0005, 0006). Read-only. The version and the listing are
// separate endpoints so each carries its own cache rule: the version's fields never change
// and are cached for good, and the listing's description can change and is cached briefly.

const noSuchVersion = (address: string) =>
  new ProblemError({
    status: 404,
    detail: `No activity is published at ${address}.`,
  });

const noSuchListing = (handle: string, name: string) =>
  new ProblemError({
    status: 404,
    detail: `No activity is listed at ${handle}/${name}.`,
  });

/**
 * The activities resource, mounted at /api/activities. Addresses match exactly: a wrong-case
 * handle or name is never lowercased, so it finds nothing and answers 404.
 */
export const activities = new Hono<AppEnv>()
  .get(
    "/:handle/:name/versions/:version",
    // Only a 200 is stored and given the long-cache header, so a 404 is never kept.
    cache({ cacheName: versionCacheName, cacheControl: versionCacheControl }),
    async (c) => {
      const address = c.req.param();
      // D1 first: a document with no row is never served (ADR 0005).
      const version = await c.var.storage.findVersion(address);
      if (version === undefined) {
        throw noSuchVersion(formatAddress(address));
      }
      const document = await c.var.storage.readVersionDocument(address);
      if (document === undefined) {
        // Publishing writes the document before the row, so this is never anticipated.
        throw new Error(
          `The version row at ${formatAddress(address)} has no document.`,
        );
      }
      return c.json<VersionResponse>(versionResponse(version, document), 200);
    },
  )
  .get("/:handle/:name", async (c) => {
    const { handle, name } = c.req.param();
    const listing = await c.var.storage.findListingDescription({
      handle,
      name,
    });
    if (listing === undefined) {
      throw noSuchListing(handle, name);
    }
    c.header("Cache-Control", listingCacheControl);
    return c.json<ListingResponse>(listingResponse(listing), 200);
  });
