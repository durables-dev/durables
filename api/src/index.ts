import { Hono } from "hono";
import type { ApplyGlobalResponse } from "hono/client";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { activities } from "./activities/activities";
import type { AppEnv } from "./app-env";
import { auth } from "./auth/auth-middleware";
import { checks } from "./checks/checks";
import { handles } from "./handles/availability";
import { notFound, onError } from "./http/error-handlers";
import type { ProblemDetails } from "./http/problem";
import { rateLimits } from "./http/rate-limits";
import { sameOrigin } from "./http/same-origin";
import { sdks } from "./sdks/sdks";
import { session } from "./session/session";
import { signIn } from "./session/sign-in";
import { sitemap } from "./sitemap/sitemap";
import { storage } from "./storage/storage-middleware";

/**
 * The API foundation, with no routes: request ID, security headers, the same-origin check on
 * writes, storage, auth, rate limits, and the Problem Details 404 and error handlers.
 */
export const createApp = () =>
  new Hono<AppEnv>()
    .use(
      requestId({
        headerName: "",
        generator: (c) => c.req.header("cf-ray") ?? crypto.randomUUID(),
      }),
    )
    .use(secureHeaders())
    .use(sameOrigin())
    .use(storage())
    .use(auth())
    .use(rateLimits())
    .notFound(notFound)
    .onError(onError);

/**
 * The foundation with every production route. Routes are chained so their types reach web
 * through AppType. The local entry point builds its own copy and adds local-only routes to it.
 */
export const createProductionApp = () =>
  createApp()
    .get("/api/health", (c) => c.json({ ok: true }))
    .route("/api/session", session)
    .route("/api/session/providers", signIn)
    .route("/api/handles", handles)
    .route("/api/checks", checks)
    .route("/api/activities", activities)
    .route("/api/sdks", sdks)
    // Outside /api because crawlers look for it at the root. It is a route on the Worker,
    // so run_worker_first lists it beside /api/*.
    .route("/sitemap.xml", sitemap);

// Production entry point.
const app = createProductionApp();

// Every route can answer these Problem Details responses (api/CONVENTIONS.md, ADR 0010).
export type AppType = ApplyGlobalResponse<
  typeof app,
  {
    403: { json: ProblemDetails };
    404: { json: ProblemDetails };
    500: { json: ProblemDetails };
  }
>;

export default app;
