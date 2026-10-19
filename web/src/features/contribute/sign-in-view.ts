import { z } from "zod";
import { stepPath } from "./steps";

/** The search param that asks the Profile & Handle step for its sign-in view. */
export const signInParam = "sign-in";

/**
 * Why the sign-in view was asked for. "failed" is set by the API when a sign-in did not
 * finish (api: session/sign-in.ts, signInFailedPath). "again" opens it for a publisher who
 * is already signed in, as Back on the handle step does.
 */
const signInViewSchema = z.enum(["failed", "again"]);

export type SignInView = z.infer<typeof signInViewSchema>;

/** The sign-in view the address asks for, or undefined when it asks for none or one unknown. */
export function readSignInView(value: string | null): SignInView | undefined {
  const parsed = signInViewSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** The address of the sign-in view for a publisher who is already signed in. */
export const signInAgainPath = `${stepPath("profile")}?${signInParam}=again`;
