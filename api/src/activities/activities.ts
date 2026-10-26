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
import { detectors } from "../checks/detectors";
import { integrationsFor } from "../checks/integrations";
import { checkCode } from "../checks/pipeline";
import { codeTooLarge } from "../checks/refusals";
import {
  listingCacheControl,
  versionCacheControl,
  versionCacheName,
} from "../http/cache-control";
import { ProblemError } from "../http/problem";
import { publisherLimitKey } from "../http/rate-limits";
import { problemOnInvalid } from "../http/validation";
import { generateSnippets } from "../snippets/snippets";
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
  publishedVersion,
} from "./publish-request";
import { publishVersion } from "./publish-version";
import {
  formatAddress,
  listingResponse,
  publishResponse,
  versionLocation,
  versionResponse,
  type ListingResponse,
  type PublishResponse,
  type VersionResponse,
} from "./responses";

// Publishing an activity and reading it back (ADR 0005, 0006, 0008). The version and the
// listing are read at separate endpoints so each carries its own cache rule: the version's
// fields never change and are cached for good, and the listing's description can change and
// is cached briefly. Publishing runs the checks again and never accepts detection results
// from the client. Nothing here logs the code, and no error carries it.

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

/**
 * The activities resource, mounted at /api/activities. Addresses match exactly: a wrong-case
 * handle or name is never lowercased, so it finds nothing and answers 404.
 */
export const activities = new Hono<AppEnv>()
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
      // The publish-time run is the only one stored (ADR 0008).
      const facts = checkCode(body.code, detectors);
      const { title, name, description } = acceptListing(body);
      const address = { handle, name, version: publishedVersion };
      const integrations = integrationsFor(facts.dependencies);

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
