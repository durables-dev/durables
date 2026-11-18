import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import { isSignInProvider } from "../auth/oauth-providers";
import { ProblemError } from "../http/problem";
import type { Provider } from "../storage/storage";
import { beginSignIn } from "./begin-sign-in";
import { sameSitePath, startingPageParam } from "./starting-page";

// Sign-in with a provider (ADR 0007), mounted at /api/session/providers. Both routes are
// top-level browser navigations, not API calls: the Sign in page and the Contribute sign-in
// step link to the start route, and the provider sends the visitor back to the callback.
//
// The start route takes the page sign-in started from in the returnTo query parameter. Only a
// same-site path is kept. It travels with the OAuth state and is checked again at the callback.

/**
 * Where a finished sign-in for an existing account lands when no starting page came through
 * the round trip: the home page.
 */
export const defaultLandingPath = "/";

/** Where a finished sign-in lands when the provider account has no account: Profile & Handle. */
export const noAccountPath = "/contribute/profile";

/**
 * Where a finished sign-in lands when the provider account's Durables account is pending
 * deletion: the Restore prompt, which offers Restore or Start as a new user (ADR 0015). It sits
 * under the Sign in page, so it needs no reserved handle of its own.
 */
export const restorePath = "/sign-in/restore";

/**
 * Where a sign-in that did not finish lands: the Sign in page, with the indicator it reads to
 * show "Sign-in didn't finish. Try again, or choose another provider."
 */
export const signInFailedPath = "/sign-in?sign-in=failed";

/**
 * Where a sign-in that did not finish lands, keeping the page it started from so a retry from
 * the Sign in page can still return there. Without a starting page it is signInFailedPath.
 */
export const signInFailedLocation = (startingPage: string | undefined) =>
  startingPage === undefined
    ? signInFailedPath
    : `${signInFailedPath}&${new URLSearchParams({ [startingPageParam]: startingPage }).toString()}`;

/** The provider named in the path, or a 404 for any provider this flow does not sign in with. */
const providerParam = (name: string): Provider => {
  if (!isSignInProvider(name)) {
    throw new ProblemError({
      status: 404,
      detail: "There is no sign-in provider with this name.",
    });
  }
  return name;
};

/** The callback address registered with each provider's OAuth application. */
const callbackUrl = (requestUrl: string, provider: Provider): string =>
  new URL(`/api/session/providers/${provider}/callback`, requestUrl).href;

export const signIn = new Hono<AppEnv>()
  .get("/:provider", async (c) => {
    const provider = providerParam(c.req.param("provider"));
    c.header("Cache-Control", "no-store");
    const startingPage = sameSitePath(c.req.query(startingPageParam));
    if (!c.var.auth.providerAvailable(provider)) {
      return c.redirect(signInFailedLocation(startingPage), 302);
    }
    return c.var.auth.redirectToProvider(
      provider,
      callbackUrl(c.req.url, provider),
      startingPage,
    );
  })
  .get("/:provider/callback", async (c) => {
    const provider = providerParam(c.req.param("provider"));
    c.header("Cache-Control", "no-store");
    if (!c.var.auth.providerAvailable(provider)) {
      return c.redirect(signInFailedPath, 302);
    }
    const identity = await c.var.auth.completeProviderSignIn(
      provider,
      callbackUrl(c.req.url, provider),
    );
    const startingPage = sameSitePath(await c.var.auth.takeStartingPage());
    if (identity === undefined) {
      return c.redirect(signInFailedLocation(startingPage), 302);
    }
    const outcome = await beginSignIn(c.var.auth, c.var.storage, identity);
    if (outcome === "pending-deletion") {
      return c.redirect(restorePath, 302);
    }
    if (outcome === "no-account") {
      return c.redirect(noAccountPath, 302);
    }
    return c.redirect(startingPage ?? defaultLandingPath, 302);
  });
