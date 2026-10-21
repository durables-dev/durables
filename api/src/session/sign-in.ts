import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import { isSignInProvider } from "../auth/oauth-providers";
import { ProblemError } from "../http/problem";
import type { Provider } from "../storage/storage";

// Sign-in with a provider (ADR 0007), mounted at /api/session/providers. Both routes are
// top-level browser navigations, not API calls: the sign-in step links to the start route,
// and the provider sends the visitor back to the callback.

/** Where a finished sign-in lands: the Contribute flow, which picks the step from the session. */
export const signedInPath = "/contribute";

/**
 * Where a sign-in that did not finish lands: the sign-in step, with the indicator the step
 * reads to show "Sign-in didn't finish. Try again, or choose another provider."
 */
export const signInFailedPath = "/contribute/profile?sign-in=failed";

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
    if (!c.var.auth.providerAvailable(provider)) {
      return c.redirect(signInFailedPath, 302);
    }
    return c.var.auth.redirectToProvider(
      provider,
      callbackUrl(c.req.url, provider),
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
    if (identity === undefined) {
      return c.redirect(signInFailedPath, 302);
    }
    await c.var.auth.start(identity);
    return c.redirect(signedInPath, 302);
  });
