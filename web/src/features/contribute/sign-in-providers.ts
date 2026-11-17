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

/**
 * The start route's query parameter naming the page a finished sign-in returns to
 * (api: session/starting-page.ts, startingPageParam). The api keeps only a same-site path.
 */
export const returnToParam = "returnTo";

/**
 * The API route that starts a sign-in with a provider. The browser navigates to it. With a
 * starting page, a finished sign-in for an existing account returns there.
 */
export function signInStartPath(
  provider: SignInProvider,
  returnTo?: string,
): string {
  const path = api.api.session.providers[":provider"].$path({
    param: { provider },
  });
  return returnTo === undefined
    ? path
    : `${path}?${new URLSearchParams({ [returnToParam]: returnTo }).toString()}`;
}
