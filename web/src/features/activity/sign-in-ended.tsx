import { contributeEntryState } from "@/lib/contribute-origin";
import { Link, useLocation } from "react-router";
import styles from "./sign-in-ended.module.css";

/**
 * The contribute flow's sign-in view, for a publisher the page still shows as signed in
 * (contribute: sign-in-view, signInAgainPath).
 */
const signInAgainPath = "/contribute/profile?sign-in=again";

export interface SignInEndedProps {
  /** What to do once signed in again, such as "save". */
  then: string;
}

// Shown when a publisher's change was refused because their sign-in has ended: a link to sign
// in again, which comes back to this page.
export function SignInEnded({ then }: SignInEndedProps) {
  const location = useLocation();
  return (
    <p role="alert" className={styles["ended"]}>
      Your sign-in has ended.{" "}
      <Link
        to={signInAgainPath}
        state={contributeEntryState(location)}
        className={styles["link"]}
      >
        Sign in again
      </Link>
      , then {then}.
    </p>
  );
}
