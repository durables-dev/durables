import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import { listingCacheControl } from "../http/cache-control";
import { type SdkProfile, sdkCatalog } from "./catalog";
import { registeredSdks } from "./registry";

// The SDK catalog resource (ADR 0013). A profile's wording can be corrected, so it carries
// the listing read's short cache, never the version read's immutable one (ADR 0006).

export const sdks = new Hono<AppEnv>().get("/", (c) => {
  c.header("Cache-Control", listingCacheControl);
  return c.json<SdkProfile[]>(sdkCatalog(registeredSdks), 200);
});
