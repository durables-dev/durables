import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import { listingCacheControl } from "../http/cache-control";
import { ProblemError } from "../http/problem";
import { type SdkProfile, sdkCatalog } from "./catalog";
import { registeredSdks, sdkRegistry } from "./registry";
import { sdkSchema } from "./sdk-list";

// The SDK catalog resource (ADR 0013). A profile's wording can be corrected, so it carries
// the listing read's short cache, never the version read's immutable one (ADR 0006). Each
// SDK's logo is served from the same resource, with the same short cache.

/** The SDK's logo as SVG markup, or a 404 for an unknown SDK or one with no logo. */
const logoFor = (name: string): string => {
  const sdk = sdkSchema.safeParse(name);
  if (!sdk.success) {
    throw new ProblemError({
      status: 404,
      detail: "There is no SDK with this name.",
    });
  }
  const { logo } = sdkRegistry[sdk.data].display;
  if (logo === undefined) {
    throw new ProblemError({
      status: 404,
      detail: `The ${sdk.data} SDK has no logo.`,
    });
  }
  return logo;
};

export const sdks = new Hono<AppEnv>()
  .get("/", (c) => {
    c.header("Cache-Control", listingCacheControl);
    return c.json<SdkProfile[]>(sdkCatalog(registeredSdks), 200);
  })
  .get("/:name/logo.svg", (c) => {
    const logo = logoFor(c.req.param("name"));
    c.header("Cache-Control", listingCacheControl);
    return c.body(logo, 200, { "Content-Type": "image/svg+xml" });
  });
