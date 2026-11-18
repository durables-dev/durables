import { sameSitePathSchema } from "@/lib/account-paths";
import { returnToParam } from "@/lib/sign-in-providers";
import { z } from "zod";

/** The search param the api sets when a sign-in did not finish (api: session/sign-in.ts). */
export const signInFailedParam = "sign-in";

/** What the Sign in page's address says. */
export interface SignInAddress {
  /** The last sign-in did not finish: it failed or was cancelled. */
  failed: boolean;
  /** The page to return to after signing in, when the address names a same-site one. */
  returnTo: string | undefined;
}

const failedSchema = z.literal("failed");

/** Reads the Sign in page's search params. Anything unknown or unsafe is left out. */
export function readSignInAddress(params: URLSearchParams): SignInAddress {
  const returnTo = sameSitePathSchema.safeParse(params.get(returnToParam));
  return {
    failed: failedSchema.safeParse(params.get(signInFailedParam)).success,
    returnTo: returnTo.success ? returnTo.data : undefined,
  };
}
