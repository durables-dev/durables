import { z } from "zod";
import { returnToParam } from "./sign-in-providers";

/** The Sign in page. "sign-in" is a reserved handle in @durables/schemas. */
export const signInPath = "/sign-in";

/** The publisher's profile. "profile" is a reserved handle in @durables/schemas. */
export const profilePath = "/profile";

/**
 * A page on this site a sign-in can return to: a path with one leading slash. Anything else,
 * including another origin, is refused. The api checks it again (api: session/starting-page.ts).
 */
export const sameSitePathSchema = z.string().regex(/^\/(?![/\\])/);

/** The Sign in page's address, carrying the page to return to after signing in. */
export function signInPagePath(returnTo?: string): string {
  return returnTo === undefined
    ? signInPath
    : `${signInPath}?${new URLSearchParams({ [returnToParam]: returnTo }).toString()}`;
}

/** Whether a path is the profile or a page inside it. */
export function isProfilePath(pathname: string): boolean {
  return pathname === profilePath || pathname.startsWith(`${profilePath}/`);
}
