import { isAccountRestoredState } from "@/lib/account-restored";
import { useLocation } from "react-router";
import styles from "./restored-notice.module.css";

// The short message on the page a finished Restore lands on, the profile. The navigation
// carries it in router state, so it shows once and is gone on the next page.
export function RestoredNotice() {
  const location = useLocation();
  if (!isAccountRestoredState(location.state)) return null;

  return (
    <div className={styles["notice"]}>
      <p role="status" className={styles["message"]}>
        Your account is restored.
      </p>
    </div>
  );
}
