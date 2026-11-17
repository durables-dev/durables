import { formatAddress } from "../activities/responses";
import type { Session } from "../auth/auth";
import { sessionHandle } from "../session/session-handle";
import type {
  AccountProfile,
  OwnedListing,
  Provider,
  Sdk,
} from "../storage/storage";

// What the profile resource answers with. Both reads are for the signed-in owner only. The
// profile is the one read that returns the owner's email: the session read never does.

/** The providers whose accounts have a username. Google and Microsoft accounts have none. */
const providersWithUsernames: readonly Provider[] = ["github", "gitlab"];

/** What the provider told Durables at sign-in, as the session cookie carries it. */
export interface ProviderDetails {
  name: string;
  /** Null when the provider gave no email. Only ever sent to its owner, by the profile read. */
  email: string | null;
  /** The provider account's username. Always null for Google and Microsoft. */
  username: string | null;
  /** Null when the provider gave no avatar. */
  avatarUrl: string | null;
  providerAccountId: string;
}

/** The owner's profile, as `GET /api/profile` answers it once their account exists. */
export interface OwnerProfileResponse {
  accountExists: true;
  handle: string;
  provider: Provider;
  /** When the account was created, as an ISO 8601 timestamp. */
  joinedAt: string;
  /** How many of the owner's activities are in search. */
  listedCount: number;
  providerDetails: ProviderDetails;
}

/**
 * `GET /api/profile` for a signed-in person with no account: the same handle and
 * account-exists answer the session read gives them.
 */
export interface NoAccountProfileResponse {
  accountExists: false;
  /** The handle chosen on the handle step, or null before one is chosen. */
  handle: string | null;
}

export type ProfileResponse = OwnerProfileResponse | NoAccountProfileResponse;

/** Whether an activity is in search. */
export type ActivityStatus = "listed" | "removed";

/** One of the owner's activities, at its latest version. */
export interface OwnedActivity {
  handle: string;
  name: string;
  /** The latest version number. */
  version: string;
  /** The latest version's full address: `handle/name@version`. */
  address: string;
  title: string;
  sdk: Sdk;
  versionCount: number;
  /** When the latest version was published, as an ISO 8601 timestamp. */
  latestPublishedAt: string;
  status: ActivityStatus;
}

/** The owner's activities, as `GET /api/profile/activities` answers it. */
export interface OwnedActivitiesResponse {
  /** Every activity, removed ones included, newest published first. */
  activities: OwnedActivity[];
}

/** The provider details from the session, with the username dropped where there is none. */
export const providerDetails = (current: Session): ProviderDetails => ({
  name: current.name,
  email: current.email ?? null,
  username: providersWithUsernames.includes(current.provider)
    ? (current.username ?? null)
    : null,
  avatarUrl: current.avatarUrl ?? null,
  providerAccountId: current.providerAccountId,
});

/** The profile read's answer, from the session and the account's profile, if it has one. */
export const profileResponse = (
  current: Session,
  profile: AccountProfile | undefined,
): ProfileResponse => {
  if (profile === undefined) {
    const { handle } = sessionHandle(current, undefined);
    return { accountExists: false, handle };
  }
  return {
    accountExists: true,
    handle: profile.handle,
    provider: current.provider,
    joinedAt: profile.joinedAt.toISOString(),
    listedCount: profile.listedCount,
    providerDetails: providerDetails(current),
  };
};

/** One row of the activities read. */
export const ownedActivity = (listing: OwnedListing): OwnedActivity => ({
  handle: listing.handle,
  name: listing.name,
  version: listing.version,
  address: formatAddress(listing),
  title: listing.title,
  sdk: listing.sdk,
  versionCount: listing.versionCount,
  latestPublishedAt: listing.publishedAt.toISOString(),
  status: listing.removed ? "removed" : "listed",
});
