import { api } from "@/lib/api-client";
import type { SessionUser } from "@/lib/session";

export type SignInProvider = SessionUser["provider"];

/** The four sign-in providers, as equal choices, in the order the sign-in step shows them. */
export const signInProviders = [
  { id: "github", name: "GitHub" },
  { id: "gitlab", name: "GitLab" },
  { id: "google", name: "Google" },
  { id: "microsoft", name: "Microsoft" },
] as const satisfies readonly { id: SignInProvider; name: string }[];

/** The API route that starts a sign-in with a provider. The browser navigates to it. */
export function signInStartPath(provider: SignInProvider): string {
  return api.api.session.providers[":provider"].$path({ param: { provider } });
}
