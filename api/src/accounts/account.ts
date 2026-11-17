import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app-env";
import { requirePublisher } from "../auth/require-publisher";
import { noStoreCacheControl } from "../http/cache-control";
import { ProblemError } from "../http/problem";
import { problemOnInvalid } from "../http/validation";

// The signed-in publisher's own account, mounted at /api/account. Deleting it starts the 30-day
// grace period (ADR 0015): the account is marked pending, every listed activity leaves search
// with account deletion as the source, and the session ends. Nothing published is deleted.

/** The body of `DELETE /api/account`: the handle as the publisher typed it to confirm. */
export const deleteAccountBody = z.object({
  handle: z.string({ error: "Type your handle to confirm." }),
});

/** The account resource, mounted at /api/account. */
export const account = new Hono<AppEnv>().delete(
  "/",
  // 401 with no session, and 403 when the account is already pending deletion.
  requirePublisher(),
  zValidator("json", deleteAccountBody, problemOnInvalid),
  async (c) => {
    const { handle: typed } = c.req.valid("json");
    const { account: current, auth, storage } = c.var;
    // Every account gets its handle when it is created, so a missing one means no account.
    if (!current?.handle) {
      throw new ProblemError({
        status: 404,
        detail: "There is no account to delete.",
      });
    }
    // The typed handle must match exactly: no change of case, no trimming.
    if (typed !== current.handle) {
      const message = `Type your handle exactly as it is: ${current.handle}.`;
      throw new ProblemError({
        status: 422,
        detail: message,
        errors: [{ field: "handle", message }],
      });
    }
    if ((await storage.requestAccountDeletion(current.id)) === undefined) {
      // Another request deleted it since requirePublisher looked.
      throw new ProblemError({
        status: 409,
        detail: "This account is already waiting to be deleted.",
      });
    }
    auth.end();
    c.header("Cache-Control", noStoreCacheControl);
    return c.body(null, 204);
  },
);
