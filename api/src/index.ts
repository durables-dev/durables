import { Hono } from "hono";
import type { ApplyGlobalResponse } from "hono/client";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./app-env";
import { auth } from "./auth/auth-middleware";
import { handles } from "./handles/availability";
import { notFound, onError } from "./http/error-handlers";
import type { ProblemDetails } from "./http/problem";
import { sameOrigin } from "./http/same-origin";
import { session } from "./session/session";
import { signIn } from "./session/sign-in";
import { storage } from "./storage/storage-middleware";

/**
 * The API foundation, with no routes: request ID, security headers, the same-origin check on
 * writes, storage, auth, and the Problem Details 404 and error handlers.
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
    .route("/api/handles", handles);

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
