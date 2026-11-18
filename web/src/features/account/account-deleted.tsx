import { PageTitle } from "@/components/page-title";
import { Link } from "react-router";
import styles from "./account-deleted.module.css";

// The screen that replaces the profile once the account is deleted. Focus moves to its heading
// as it appears, since the dialog and the button that opened it are gone.
export function AccountDeleted() {
  return (
    <div className={styles["screen"]}>
      <PageTitle page="Account deleted" />
      <h1
        tabIndex={-1}
        ref={(heading) => {
          heading?.focus();
        }}
        className={styles["heading"]}
      >
        Your account has been deleted
      </h1>
      <p className={styles["text"]}>
        Your activities are out of search. Sign in with the same account within
        30 days to restore it.
      </p>
      <Link to="/" className={styles["home"]}>
        Go to Durables
      </Link>
    </div>
  );
}
