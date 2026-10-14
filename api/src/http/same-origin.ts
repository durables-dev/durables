import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import { ProblemError } from "./problem";

// Every non-GET request must come from our origin (api/CONVENTIONS.md). The browser states the
// relationship in Sec-Fetch-Site: same-origin for our own pages, none for a direct navigation.
// A missing header, or same-site or cross-site, is refused.

const readMethods = new Set(["GET", "HEAD"]);
const ownSites = new Set(["same-origin", "none"]);

export const isAllowedRequest = (
  method: string,
  secFetchSite: string | undefined,
): boolean =>
  readMethods.has(method.toUpperCase()) ||
  (secFetchSite !== undefined && ownSites.has(secFetchSite));

/** Refuses a write from anywhere but our origin with 403, before any handler runs. */
export const sameOrigin = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!isAllowedRequest(c.req.method, c.req.header("Sec-Fetch-Site"))) {
      throw new ProblemError({
        status: 403,
        detail: "Changes are accepted only from the Durables site.",
      });
    }
    await next();
  });
