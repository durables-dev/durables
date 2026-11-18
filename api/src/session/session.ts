import {
  handleFormatSchema,
  handleInvalidMessage,
  handleTakenMessage,
} from "@durables/schemas";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { finalDeletionAt } from "../accounts/deletion";
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

/**
 * A finished sign-in held for the Restore choice, because its account is pending deletion
 * (ADR 0015). It names the handle and when the deletion becomes final. It never lists the
 * activities.
 */
export interface RestoreChoice {
  handle: string | null;
  /** When the deletion becomes final, as an ISO 8601 time. */
  finalAt: string;
}

export interface SessionResponse {
  user: SessionUser | null;
  /**
   * Present only when there is no session and a sign-in is held for the Restore choice. Restore
   * and Start as a new user are the only things it can do.
   */
  restore?: RestoreChoice;
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

/** The refusal when the held sign-in's account is no longer pending deletion. */
const notPendingDeletion = () =>
  new ProblemError({
    status: 409,
    detail: "This account isn't waiting to be deleted. Sign in again.",
  });

/**
 * The held sign-in and its account, which must be pending deletion. Answers 401 when no sign-in
 * is held, and 409 when its account has been restored or finally deleted since.
 */
const heldPendingAccount = async (c: Context<AppEnv>) => {
  const identity = await c.var.auth.pendingSignIn();
  if (identity === undefined) {
    throw new ProblemError({ status: 401, detail: "Sign in first." });
  }
  const account = await c.var.storage.findAccountState(identity);
  if (!account?.deletionRequestedAt) {
    throw notPendingDeletion();
  }
  return { identity, account };
};

/** The Restore choice for a held sign-in, or undefined when none is held or it is no longer pending. */
const restoreChoice = async (
  c: Context<AppEnv>,
): Promise<RestoreChoice | undefined> => {
  const identity = await c.var.auth.pendingSignIn();
  if (identity === undefined) {
    return undefined;
  }
  const account = await c.var.storage.findAccountState(identity);
  if (!account?.deletionRequestedAt) {
    return undefined;
  }
  return {
    handle: account.handle,
    finalAt: finalDeletionAt(account.deletionRequestedAt).toISOString(),
  };
};

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
      const restore = await restoreChoice(c);
      return c.json<SessionResponse>(
        restore === undefined ? { user: null } : { user: null, restore },
        200,
      );
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
  // Restore: clears the pending mark, returns to search only the activities account deletion
  // removed, and starts the session (ADR 0015).
  .post("/restore", async (c) => {
    const { identity, account } = await heldPendingAccount(c);
    if (!(await c.var.storage.restoreAccount(account.id))) {
      throw notPendingDeletion();
    }
    const started = await c.var.auth.start(identity);
    c.header("Cache-Control", "no-store");
    return c.json<SessionResponse>(
      {
        user: {
          ...sessionUser(started, true),
          ...sessionHandle(started, account),
        },
      },
      200,
    );
  })
  // Start as a new user: makes the deletion final now, through the same step as the daily
  // final-deletion job, then starts a session with no account (ADR 0015).
  .post("/start-over", async (c) => {
    const { identity, account } = await heldPendingAccount(c);
    if (!(await c.var.storage.finalizeAccountDeletion(account.id))) {
      throw notPendingDeletion();
    }
    const started = await c.var.auth.start(identity);
    c.header("Cache-Control", "no-store");
    return c.json<SessionResponse>({ user: sessionUser(started, false) }, 200);
  })
  .delete("/", (c) => {
    c.var.auth.end();
    c.header("Cache-Control", "no-store");
    return c.body(null, 204);
  });
