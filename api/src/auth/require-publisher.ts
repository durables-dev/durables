import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import { ProblemError } from "../http/problem";
import type { AccountState } from "../storage/storage";
import type { Session } from "./auth";

/**
 * The signed-in publisher, and their account when it exists, set on c.var by requirePublisher.
 * The account is undefined until the first publish creates it.
 */
export interface PublisherVariables {
  Variables: { publisher: Session; account: AccountState | undefined };
}

/** The refusal for a session whose account is waiting to be deleted (ADR 0015). */
export const accountPendingDeletion = () =>
  new ProblemError({
    status: 403,
    detail:
      "This account is waiting to be deleted. Sign in again to restore it first.",
  });

/**
 * Answers 401 when there is no signed-in session, and 403 when the session's account is pending
 * deletion. Sessions are signed cookies, so a deleted account's sessions on other devices stay
 * valid until they expire: this check is what stops them publishing or changing anything
 * (ADR 0015). Sets the publisher and their account on c.var.
 */
export const requirePublisher = () =>
  createMiddleware<AppEnv & PublisherVariables>(async (c, next) => {
    const publisher = await c.var.auth.session();
    if (publisher === undefined) {
      throw new ProblemError({ status: 401, detail: "Sign in first." });
    }
    const account = await c.var.storage.findAccountState(publisher);
    if (account !== undefined && account.deletionRequestedAt !== null) {
      throw accountPendingDeletion();
    }
    c.set("publisher", publisher);
    c.set("account", account);
    await next();
  });
