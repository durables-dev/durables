import type { Session } from "../auth/auth";
import type { Account } from "../storage/storage";

/** The handle that applies to a signed-in session, and whether its account exists. */
export interface SessionHandle {
  handle: string | null;
  accountExists: boolean;
}

/**
 * Once the account exists, its handle applies, whatever the cookie holds. Before that, the
 * handle chosen on the handle step and held in the cookie applies.
 */
export const sessionHandle = (
  current: Pick<Session, "handle">,
  account: Account | undefined,
): SessionHandle =>
  account === undefined
    ? { handle: current.handle, accountExists: false }
    : { handle: account.handle, accountExists: true };
