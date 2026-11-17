import { api } from "@/lib/api-client";
import { problemFrom } from "@/lib/problem";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse, type InferResponseType } from "hono/client";

// The profile page is two owner-only reads: the profile and the owner's activities. Both
// answer 401 when signed out, which is never tried again (lib/query-retry.ts).

/** What the profile read answers: the owner's profile, or no account yet. */
export type ProfileResponse = InferResponseType<
  typeof api.api.profile.$get,
  200
>;

/** The owner's profile, once their account exists. */
export type OwnerProfile = Extract<ProfileResponse, { accountExists: true }>;

/** What the provider told Durables at sign-in. */
export type ProviderDetails = OwnerProfile["providerDetails"];

/** One of the owner's activities, at its latest version. */
export type OwnedActivity = InferResponseType<
  typeof api.api.profile.activities.$get,
  200
>["activities"][number];

/** Whether a failed read means the visitor is not signed in. */
export function isSignedOut(error: unknown): boolean {
  return problemFrom(error)?.status === 401;
}

/** The signed-in owner's profile. */
export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: () => parseResponse(api.api.profile.$get()),
});

/** Every one of the owner's activities, removed ones included. */
export const ownedActivitiesQuery = queryOptions({
  queryKey: ["profile", "activities"],
  queryFn: () => parseResponse(api.api.profile.activities.$get()),
});
