import type { Account } from "../model/account.js";
import type { AuthProvider } from "./auth-provider.js";

export const USER_HEADER = "x-durables-user";

const USERS: Account[] = [
  { handle: "kisasa", displayName: "Kisasa" },
  { handle: "demo-consumer", displayName: "Demo Consumer" },
];

// POC-SHORTCUT: SC-001
export const hardcodedAuth: AuthProvider = {
  resolve(headers) {
    const raw = headers[USER_HEADER];
    const handle = Array.isArray(raw) ? raw[0] : raw;
    return USERS.find((user) => user.handle === handle) ?? null;
  },
};
