import { PageMessage } from "@/components/page-message";
import { PageTitle } from "@/components/page-title";
import { profilePath, signInPagePath } from "@/lib/account-paths";
import { sessionQuery, signedOut } from "@/lib/session";
import { useSessionUser } from "@/lib/use-session-user";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { flushSync } from "react-dom";
import { Navigate } from "react-router";
import { AccountDeleted } from "./account-deleted";
import { DeleteAccountSection } from "./delete-account-section";
import { HandleCard } from "./handle-card";
import {
  isSignedOut,
  ownedActivitiesQuery,
  profileQuery,
} from "./profile-queries";
import styles from "./profile-page.module.css";
import { ProfileTop } from "./profile-top";
import { ProviderCard } from "./provider-card";
import { YourActivities } from "./your-activities";

/**
 * The roots of the cached reads a deleted account leaves out of date. Browse results and
 * listings still show its activities in search (search: browse-query, activity:
 * listing-queries). Features never import from each other, so the keys are named here.
 */
const browseResultsKey = ["activities"] as const;
const listingsKey = ["listings"] as const;

// The profile, or the Account deleted screen once its owner has deleted the account.
export function ProfilePage() {
  const queryClient = useQueryClient();
  const [deleted, setDeleted] = useState(false);

  if (deleted) return <AccountDeleted />;
  return (
    <OwnerProfilePage
      onDeleted={() => {
        // The deleted screen replaces the profile first, so nothing on the page is still
        // reading the profile when its cache goes. Then the header shows signed out, and the
        // owner's details, email included, are gone from the cache.
        flushSync(() => {
          setDeleted(true);
        });
        queryClient.setQueryData(sessionQuery.queryKey, signedOut);
        queryClient.removeQueries({ queryKey: profileQuery.queryKey });
        queryClient.removeQueries({ queryKey: browseResultsKey });
        queryClient.removeQueries({ queryKey: listingsKey });
      }}
    />
  );
}

interface OwnerProfilePageProps {
  /** Runs once the owner has deleted their account. */
  onDeleted: () => void;
}

// The profile, which only its owner can see. A signed-out visitor goes to the Sign in page,
// which brings them back here. A signed-in person with no account yet goes to Contribute.
// The page shows once both reads have answered. If either fails, the page says so and shows
// nothing else.
function OwnerProfilePage({ onDeleted }: OwnerProfilePageProps) {
  const profile = useQuery(profileQuery);
  const activities = useQuery(ownedActivitiesQuery);
  const initials = useSessionUser()?.initials;

  if (isSignedOut(profile.error) || isSignedOut(activities.error)) {
    return <Navigate to={signInPagePath(profilePath)} replace />;
  }
  if (profile.data?.accountExists === false) {
    return <Navigate to="/contribute" replace />;
  }
  if (profile.isError || activities.isError) {
    const retrying = profile.isFetching || activities.isFetching;
    return (
      <PageMessage heading="Something went wrong">
        <div className={styles["failure"]}>
          <p>Your profile could not be loaded. Try again in a moment.</p>
          <button
            type="button"
            className={styles["retry"]}
            disabled={retrying}
            onClick={() => {
              if (profile.isError) void profile.refetch();
              if (activities.isError) void activities.refetch();
            }}
          >
            {retrying ? "Trying again…" : "Try again"}
          </button>
        </div>
      </PageMessage>
    );
  }
  if (profile.data === undefined || activities.data === undefined) {
    return (
      <div className={styles["page"]}>
        <PageTitle page="Your profile" />
        <p role="status" className={styles["loading"]}>
          Loading your profile…
        </p>
      </div>
    );
  }

  const owner = profile.data;
  return (
    <div className={styles["page"]}>
      <PageTitle page={owner.handle} />
      <ProfileTop
        handle={owner.handle}
        initials={initials ?? owner.handle.charAt(0).toUpperCase()}
        provider={owner.provider}
        joinedAt={owner.joinedAt}
      />
      <div className={styles["cards"]}>
        <HandleCard handle={owner.handle} />
        <ProviderCard
          provider={owner.provider}
          details={owner.providerDetails}
        />
      </div>
      <YourActivities activities={activities.data.activities} />
      <DeleteAccountSection
        handle={owner.handle}
        listedCount={owner.listedCount}
        onDeleted={onDeleted}
      />
    </div>
  );
}
