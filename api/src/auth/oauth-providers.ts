import { githubAuth } from "@hono/oauth-providers/github";
import { googleAuth } from "@hono/oauth-providers/google";
import { msentraAuth } from "@hono/oauth-providers/msentra";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app-env";
import type { Provider } from "../storage/storage";

// The providers whose sign-in runs through @hono/oauth-providers (ADR 0007). GitLab is one of
// the four providers too, but the package has no GitLab flow, so it is hand-written apart
// from this list.

export const oauthProviders = [
  "github",
  "google",
  "microsoft",
] as const satisfies readonly Provider[];

export type OAuthProvider = (typeof oauthProviders)[number];

export const isOAuthProvider = (name: string): name is OAuthProvider =>
  (oauthProviders as readonly string[]).includes(name);

/**
 * The scopes each provider is asked for. Identity only: name, email, avatar and account ID.
 * No repository, organization or other scopes in the MVP (ADR 0007).
 */
export const identityScopes = {
  // Public profile needs no scope. user:email reads the primary email address.
  github: ["user:email"],
  google: ["openid", "email", "profile"],
  // User.Read is what Microsoft Graph's /me needs to return the signed-in user.
  microsoft: ["openid", "email", "profile", "User.Read"],
} as const satisfies Record<OAuthProvider, readonly string[]>;

/** Personal and work or school Microsoft accounts can both sign in. */
const microsoftTenant = "common";

/** The context variable the package puts each provider's user record in. */
export const providerUserVariable = {
  github: "user-github",
  google: "user-google",
  microsoft: "user-msentra",
} as const satisfies Record<OAuthProvider, string>;

/** The name of the cookie the package keeps the state in between start and callback. */
export const stateCookieName = "state";

/** How long the code exchange may take before sign-in is treated as failed. */
export const exchangeTimeoutMs = 10_000;

/** An OAuth application's credentials, as supplied at deploy. */
export interface ClientCredentials {
  clientId: string | undefined;
  clientSecret: string | undefined;
}

/**
 * The package's middleware for one provider. With no code in the request it redirects to the
 * provider; with a code it checks the state, exchanges the code and reads the user.
 */
export const providerMiddleware = (
  provider: OAuthProvider,
  { clientId, clientSecret }: { clientId: string; clientSecret: string },
  callbackUrl: string,
): MiddlewareHandler<AppEnv> => {
  switch (provider) {
    case "github":
      return githubAuth({
        client_id: clientId,
        client_secret: clientSecret,
        scope: [...identityScopes.github],
        // An OAuth app, so the scope is sent. A GitHub App would ignore it.
        oauthApp: true,
        redirect_uri: callbackUrl,
      });
    case "google":
      return googleAuth({
        client_id: clientId,
        client_secret: clientSecret,
        scope: [...identityScopes.google],
        redirect_uri: callbackUrl,
      });
    case "microsoft":
      return msentraAuth({
        client_id: clientId,
        client_secret: clientSecret,
        tenant_id: microsoftTenant,
        scope: [...identityScopes.microsoft],
        redirect_uri: callbackUrl,
      });
  }
};

/** Thrown by withTimeout when the work does not settle in time. */
export class TimeoutError extends Error {
  constructor() {
    super("Timed out");
    this.name = "TimeoutError";
  }
}

/** The work's result, or a TimeoutError once the time runs out. The timer is always cleared. */
export const withTimeout = async <T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};
