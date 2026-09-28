import type { Account } from "../model/account.js";

/** Resolves the caller of a request to an account. The real one would read a session. */
export interface AuthProvider {
  /** Returns the signed-in account, or null if the request carries no known user. */
  resolve(headers: Record<string, string | string[] | undefined>): Account | null;
}
