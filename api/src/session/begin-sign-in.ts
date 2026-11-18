import type { Auth, SessionIdentity } from "../auth/auth";
import type { Storage } from "../storage/storage";

/**
 * What a finished sign-in found: an account, no account, or an account pending deletion. A
 * pending account gets no session. Its sign-in is held for the Restore choice (ADR 0015).
 */
export type SignInOutcome = "account" | "no-account" | "pending-deletion";

/**
 * Starts the session for a provider identity whose sign-in has finished, or holds the sign-in
 * for the Restore choice when its account is pending deletion. The provider callback and the
 * local fake provider both sign in through this, so they treat a pending account the same way.
 */
export const beginSignIn = async (
  auth: Auth,
  storage: Storage,
  identity: SessionIdentity,
): Promise<SignInOutcome> => {
  const account = await storage.findAccountState(identity);
  if (account !== undefined && account.deletionRequestedAt !== null) {
    await auth.holdPendingSignIn(identity);
    return "pending-deletion";
  }
  await auth.start(identity);
  return account === undefined ? "no-account" : "account";
};
