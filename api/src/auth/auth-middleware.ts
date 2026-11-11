import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import { Auth } from "./auth";

/**
 * Builds the auth interface from the signing key and the providers' credentials, and sets it
 * on c.var.auth for every handler.
 */
export const auth = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set(
      "auth",
      new Auth(c, c.env.SESSION_SIGNING_KEY, {
        github: {
          clientId: c.env.GITHUB_CLIENT_ID,
          clientSecret: c.env.GITHUB_CLIENT_SECRET,
        },
        gitlab: {
          clientId: c.env.GITLAB_CLIENT_ID,
          clientSecret: c.env.GITLAB_CLIENT_SECRET,
        },
        google: {
          clientId: c.env.GOOGLE_CLIENT_ID,
          clientSecret: c.env.GOOGLE_CLIENT_SECRET,
        },
        microsoft: {
          clientId: c.env.MICROSOFT_CLIENT_ID,
          clientSecret: c.env.MICROSOFT_CLIENT_SECRET,
        },
      }),
    );
    await next();
  });
