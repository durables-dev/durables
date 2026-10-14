import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import type { Provider } from "../storage/storage";
import { initials } from "../auth/initials";

/** The signed-in publisher, as web sees them. The email is never part of it. */
export interface SessionUser {
  name: string;
  initials: string;
  provider: Provider;
  /** The handle chosen on the handle step, or null before one is chosen. */
  handle: string | null;
  /** True once the provider account is linked to a Durables account. */
  accountExists: boolean;
}

export interface SessionResponse {
  user: SessionUser | null;
}

/** The session resource, mounted at /api/session: read it, or end it to sign out. */
export const session = new Hono<AppEnv>()
  .get("/", async (c) => {
    c.header("Cache-Control", "no-store");
    const current = await c.var.auth.session();
    if (current === undefined) {
      return c.json<SessionResponse>({ user: null }, 200);
    }
    const account = await c.var.storage.findAccountByProviderIdentity(current);
    return c.json<SessionResponse>(
      {
        user: {
          name: current.name,
          initials: initials(current.name),
          provider: current.provider,
          handle: current.handle,
          accountExists: account !== undefined,
        },
      },
      200,
    );
  })
  .delete("/", (c) => {
    c.var.auth.end();
    c.header("Cache-Control", "no-store");
    return c.body(null, 204);
  });
