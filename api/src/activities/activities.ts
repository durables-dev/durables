import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cache } from "hono/cache";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import {
  type PublisherVariables,
  requirePublisher,
} from "../auth/require-publisher";
import { integrationsFor } from "../checks/integrations";
import { checkCode } from "../checks/pipeline";
import { codeTooLarge } from "../checks/refusals";
import {
  listingCacheControl,
  noStoreCacheControl,
  versionCacheControl,
  versionCacheName,
} from "../http/cache-control";
import { ProblemError } from "../http/problem";
import { publisherLimitKey } from "../http/rate-limits";
import { problemOnInvalid } from "../http/validation";
import { registeredSdks } from "../sdks/registry";
import { generateSnippets } from "../snippets/snippets";
import type { RemovalSource } from "../storage/storage";
import { encodeBrowseCursor } from "./browse-cursor";
import { BROWSE_BATCH_SIZE, browseQuery, browseSort } from "./browse-request";
import { descriptionBody } from "./description-request";
import {
  addressTaken,
  handleNotChosen,
  handleTaken,
  publishLimited,
} from "./publish-problems";
import {
  acceptListing,
  MAX_PUBLISH_BODY_BYTES,
  publishBody,
  FIRST_VERSION,
} from "./publish-request";
import { publishVersion } from "./publish-version";
import {
  activityCard,
  formatAddress,
  listingResponse,
  publishResponse,
  versionLocation,
  versionResponse,
  type BrowseResponse,
  type ListingResponse,
  type PublishResponse,
  type VersionResponse,
} from "./responses";

// Publishing an activity, reading it back, saving a version's description, and taking the
// activity out of search and returning it (ADR 0005, 0006, 0008, 0015). The version and the
// listing are read at separate endpoints so each carries its own cache rule: the version's
// fields never change and are cached for good, and the listing read answers the state that can
// change, such as each version's description and the listing's removal, and is cached briefly.
// Publishing runs the checks again and never accepts detection results from the client.
// Nothing here logs the code, and no error carries it.

/** Answers 413 Problem Details, the same refusal as oversized code, when the body is too large. */
const publishBodyLimit = () =>
  bodyLimit({
    maxSize: MAX_PUBLISH_BODY_BYTES,
    onError: () => {
      throw codeTooLarge();
    },
  });

/** Answers 429 when the publisher has used up their publishes for now. */
const publishRateLimit = () =>
  createMiddleware<AppEnv & PublisherVariables>(async (c, next) => {
    const { success } = await c.var.publishLimit.limit({
      key: publisherLimitKey(c.var.publisher),
    });
    if (!success) {
      throw publishLimited();
    }
    await next();
  });

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

/** Answers 409 when a removal someone other than the publisher made stays in place. */
const notThePublishersRemoval = (removedBy: RemovalSource) =>
  new ProblemError({
    status: 409,
    detail:
      removedBy === "account-deletion"
        ? "This activity was taken out of search when its account was deleted. Restoring the account returns it."
        : "Durables took this activity out of search. Only Durables can return it.",
  });

/**
 * Answers 403 when the signed-in publisher's account handle is not the address's handle, then
 * 404 when the account has no listing at that name. A session with no account owns nothing.
 * It runs before the body is validated, so ownership is answered first.
 */
const requireListingOwner = () =>
  createMiddleware<AppEnv & PublisherVariables>(async (c, next) => {
    const handle = c.req.param("handle");
    const name = c.req.param("name");
    if (handle === undefined || name === undefined) {
      throw new Error("The listing owner check is mounted without an address.");
    }
    const { publisher, storage } = c.var;
    const account = await storage.findAccountByProviderIdentity(publisher);
    if (account?.handle !== handle) {
      throw new ProblemError({
        status: 403,
        detail: "Only the listing's publisher can change it.",
      });
    }
    const listing = await storage.findListingVersions({ handle, name });
    if (listing === undefined) {
      throw noSuchListing(handle, name);
    }
    await next();
  });

/**
 * The activities resource, mounted at /api/activities. Addresses match exactly: a wrong-case
 * handle or name is never lowercased, so it finds nothing and answers 404.
 */
export const activities = new Hono<AppEnv>()
  // Browse and search read the database on every request and are never cached or rate-limited
  // (ADR 0005, 0006), so a newly published activity or a changed description shows at once.
  .get("/", zValidator("query", browseQuery, problemOnInvalid), async (c) => {
    const {
      q: words = [],
      sdk: sdks,
      integration: integrations,
      publisher,
      cursor: after,
    } = c.req.valid("query");
    const sort = browseSort(words);
    // One card more than a batch shows whether another batch follows.
    const { listings, count } = await c.var.storage.browseListings({
      words,
      sdks,
      integrations,
      publisher,
      after,
      limit: BROWSE_BATCH_SIZE + 1,
    });
    const batch = listings.slice(0, BROWSE_BATCH_SIZE);
    const last = batch.at(-1);
    c.header("Cache-Control", noStoreCacheControl);
    return c.json<BrowseResponse>(
      {
        activities: batch.map(activityCard),
        count,
        sort,
        nextCursor:
          listings.length > BROWSE_BATCH_SIZE && last !== undefined
            ? encodeBrowseCursor({ ...last, sort })
            : null,
      },
      200,
    );
  })
  .post(
    "/",
    requirePublisher(),
    publishBodyLimit(),
    publishRateLimit(),
    zValidator("json", publishBody, problemOnInvalid),
    async (c) => {
      const body = c.req.valid("json");
      const { publisher, storage } = c.var;
      // An account's handle is permanent. Until the account exists, the session carries the
      // chosen handle (ADR 0007).
      const account = await storage.findAccountByProviderIdentity(publisher);
      const handle = account?.handle ?? publisher.handle;
      if (handle === null) {
        throw handleNotChosen();
      }
      // The publish-time run is the only one stored (ADR 0008). A declared SDK is re-run with
      // its own detector, as the check does.
      const facts = checkCode(body.code, registeredSdks, body.declaredSdk);
      const { title, name, description } = acceptListing(body);
      const address = { handle, name, version: FIRST_VERSION };
      const integrations = integrationsFor(facts.sdk, facts.dependencies);

      const result = await publishVersion(
        storage,
        {
          listing: {
            ...address,
            title,
            description,
            sdk: facts.sdk,
            integrations,
          },
          document: {
            code: body.code,
            facts,
            integrations,
            snippets: generateSnippets(facts, address),
            title,
            description,
          },
          ...(account === undefined
            ? {
                newAccount: {
                  provider: publisher.provider,
                  providerAccountId: publisher.providerAccountId,
                },
              }
            : {}),
        },
        { requestId: c.var.requestId },
      );
      if (result.outcome === "address-taken") {
        throw addressTaken();
      }
      if (result.outcome === "handle-taken") {
        throw handleTaken(handle);
      }
      c.header("Cache-Control", "no-store");
      c.header("Location", versionLocation(address));
      return c.json<PublishResponse>(
        publishResponse(address, result.accountCreated),
        201,
      );
    },
  )
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
  // Every version, newest first, with its current description and deprecation. Never stored
  // through the Cache API and never part of the version read (ADR 0006, ADR 0015).
  .get("/:handle/:name", async (c) => {
    const { handle, name } = c.req.param();
    const listing = await c.var.storage.findListingVersions({ handle, name });
    if (listing === undefined) {
      throw noSuchListing(handle, name);
    }
    c.header("Cache-Control", listingCacheControl);
    return c.json<ListingResponse>(listingResponse(listing), 200);
  })
  // Saving a description changes the named version's description only (ADR 0015). Other
  // versions are untouched, and version documents are never rewritten, because version
  // responses are cached for good (ADR 0006). The listing read is never stored through the
  // Cache API, so there is nothing to clear. Checks run in order: signed in (401), owner (403),
  // listing exists (404), the body (400), then the version is the listing's (404).
  .patch(
    "/:handle/:name",
    requirePublisher(),
    requireListingOwner(),
    zValidator("json", descriptionBody, problemOnInvalid),
    async (c) => {
      const { handle, name } = c.req.param();
      const { version, description } = c.req.valid("json");
      const address = { handle, name, version };
      const { storage } = c.var;
      if (
        !(await storage.updateVersionDescription({ ...address, description }))
      ) {
        throw noSuchVersion(formatAddress(address));
      }
      const listing = await storage.findListingVersions({ handle, name });
      if (listing === undefined) {
        throw noSuchListing(handle, name);
      }
      c.header("Cache-Control", noStoreCacheControl);
      return c.json<ListingResponse>(listingResponse(listing), 200);
    },
  )
  // Taking the activity out of search records the publisher as who removed it (ADR 0015). It
  // leaves search, browse, search by publisher and the sitemap. Its listing read and every
  // version's address keep working. Removing a removed activity changes nothing. Checks run in
  // order: signed in (401), owner (403), then listing exists (404).
  .put(
    "/:handle/:name/removal",
    requirePublisher(),
    requireListingOwner(),
    async (c) => {
      const { handle, name } = c.req.param();
      const { storage } = c.var;
      await storage.removeFromSearch({ handle, name }, "publisher");
      const listing = await storage.findListingVersions({ handle, name });
      if (listing === undefined) {
        throw noSuchListing(handle, name);
      }
      c.header("Cache-Control", noStoreCacheControl);
      return c.json<ListingResponse>(listingResponse(listing), 200);
    },
  )
  // Returning the activity to search clears only the publisher's own removal (ADR 0015).
  // Returning a listed activity changes nothing. A removal made when the account was deleted, or
  // by Durables, stays, and answers 409. Checks run in order: signed in (401), owner (403), then
  // listing exists (404).
  .delete(
    "/:handle/:name/removal",
    requirePublisher(),
    requireListingOwner(),
    async (c) => {
      const { handle, name } = c.req.param();
      const { storage } = c.var;
      await storage.returnToSearch({ handle, name }, "publisher");
      const listing = await storage.findListingVersions({ handle, name });
      if (listing === undefined) {
        throw noSuchListing(handle, name);
      }
      if (listing.removedBy !== null) {
        throw notThePublishersRemoval(listing.removedBy);
      }
      c.header("Cache-Control", noStoreCacheControl);
      return c.json<ListingResponse>(listingResponse(listing), 200);
    },
  );
