import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import { Auth } from "./auth";

/** Builds the auth interface from the signing key and sets it on c.var.auth for every handler. */
export const auth = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("auth", new Auth(c, c.env.SESSION_SIGNING_KEY));
    await next();
  });
