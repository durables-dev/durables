import {
  handleFormatSchema,
  handleInvalidMessage,
  handleTakenMessage,
} from "@durables/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { AppEnv } from "../app-env";
import type { Session } from "../auth/auth";
import { initials } from "../auth/initials";
import { handleAvailability } from "../handles/availability";
import { ProblemError } from "../http/problem";
import { problemOnInvalid } from "../http/validation";
import type { Provider } from "../storage/storage";
import { sessionHandle } from "./session-handle";

/** The signed-in publisher, as web sees them. The email is never part of it. */
export interface SessionUser {
  name: string;
  initials: string;
  /** The provider the publisher signed in with, which the suggestion was taken from. */
  provider: Provider;
  /**
   * The handle suggested from the provider account, to start the handle step with. Absent when
   * the account has nothing that cleans to a valid handle.
   */
  suggestedHandle?: string;
  /**
   * The account's handle once the account exists. Before that, the handle chosen on the handle
   * step, or null before one is chosen.
   */
  handle: string | null;
  /** True once the provider account is linked to a Durables account. */
  accountExists: boolean;
}

export interface SessionResponse {
  user: SessionUser | null;
}

/**
 * The body of a handle save. The format rule alone is checked here, so a bad format is a 400
 * with field errors. Reserved, used and retired handles are a 409, checked in the handler.
 */
const chosenHandleBody = z.object({ handle: handleFormatSchema });

/** The session as the session read and the handle save return it. */
const sessionUser = (
  current: Session,
  accountExists: boolean,
): SessionUser => ({
  name: current.name,
  initials: initials(current.name),
  provider: current.provider,
  handle: current.handle,
  accountExists,
});

/** Answers 401 before anything else runs when there is no signed-in session. */
const requireSession = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    if ((await c.var.auth.session()) === undefined) {
      throw new ProblemError({ status: 401, detail: "Sign in first." });
    }
    await next();
  });

/**
 * The session resource, mounted at /api/session: read it, save the chosen handle to it, or
 * end it to sign out.
 */
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
          ...(current.suggestedHandle === undefined
            ? {}
            : { suggestedHandle: current.suggestedHandle }),
          ...sessionHandle(current, account),
        },
      },
      200,
    );
  })
  .put(
    "/handle",
    requireSession(),
    zValidator("json", chosenHandleBody, problemOnInvalid),
    async (c) => {
      const { handle } = c.req.valid("json");
      const current = await c.var.auth.session();
      if (current === undefined) {
        throw new ProblemError({ status: 401, detail: "Sign in first." });
      }
      // A publisher with an account already holds a permanent handle.
      if (
        (await c.var.storage.findAccountByProviderIdentity(current)) !==
        undefined
      ) {
        throw new ProblemError({
          status: 409,
          detail: "Your handle can't be changed.",
        });
      }
      // Choosing does not reserve the handle: nothing is written to storage here.
      const availability = await handleAvailability(c.var.storage, handle);
      if (availability !== "available") {
        // The validator has already refused a bad format, so only taken reaches here.
        const taken = availability === "taken";
        const message = taken
          ? handleTakenMessage(handle)
          : handleInvalidMessage(handle);
        throw new ProblemError({
          status: taken ? 409 : 400,
          detail: message,
          errors: [{ field: "handle", message }],
        });
      }
      const saved = await c.var.auth.update({ handle });
      c.header("Cache-Control", "no-store");
      return c.json<SessionResponse>({ user: sessionUser(saved, false) }, 200);
    },
  )
  .delete("/", (c) => {
    c.var.auth.end();
    c.header("Cache-Control", "no-store");
    return c.body(null, 204);
  });
