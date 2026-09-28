import { hardcodedAuth } from "../auth/hardcoded-auth.js";
import type { AuthProvider } from "../auth/auth-provider.js";
import type { Account } from "../model/account.js";

const auth: AuthProvider = hardcodedAuth;

export function currentAccount(headers: Record<string, string | string[] | undefined>): Account | null {
  return auth.resolve(headers);
}
