import { contributeEntryState } from "@/lib/contribute-origin";
import { publishedAgo } from "@/lib/published-ago";
import type { SignInProvider } from "@/lib/sign-in-providers";
import { Link, useLocation } from "react-router";
import styles from "./profile-top.module.css";
import { providerName } from "./provider-rows";

export interface ProfileTopProps {
  handle: string;
  /** The owner's initials, from the session. Never a provider avatar. */
  initials: string;
  provider: SignInProvider;
  /** When the account was created, as an ISO 8601 timestamp. */
  joinedAt: string;
}

// The top of the profile: the initials in a round badge, the handle as the page's heading,
// the provider and how long ago the account was made, and a way to contribute.
export function ProfileTop({
  handle,
  initials,
  provider,
  joinedAt,
}: ProfileTopProps) {
  const location = useLocation();

  return (
    <div className={styles["top"]}>
      <span className={styles["badge"]} aria-hidden="true">
        {initials}
      </span>
      <div className={styles["identity"]}>
        <h1 className={styles["handle"]}>{handle}</h1>
        <p className={styles["meta"]}>
          <span>Signed in with {providerName(provider)}</span>
          <span>
            Joined <time dateTime={joinedAt}>{publishedAgo(joinedAt)}</time>
          </span>
        </p>
      </div>
      <Link
        to="/contribute"
        state={contributeEntryState(location)}
        className={styles["contribute"]}
      >
        Contribute an activity
      </Link>
    </div>
  );
}
