import { PageMessage } from "@/components/page-message";
import { PageTitle } from "@/components/page-title";
import { profilePath, signInPagePath } from "@/lib/account-paths";
import { useSessionUser } from "@/lib/use-session-user";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
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

// The profile, which only its owner can see. A signed-out visitor goes to the Sign in page,
// which brings them back here. A signed-in person with no account yet goes to Contribute.
// The page shows once both reads have answered. If either fails, the page says so and shows
// nothing else.
export function ProfilePage() {
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
    </div>
  );
}
