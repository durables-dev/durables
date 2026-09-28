import { KNOWN_HANDLES } from "./CurrentUserProvider";
import { useCurrentUser } from "./useCurrentUser";
import styles from "./UserSwitcher.module.css";

/** Stands in for sign-in: pick which hardcoded user you are. */
export function UserSwitcher() {
  const { handle, me, switchTo } = useCurrentUser();
  return (
    <label className={styles.switcher}>
      <span>Signed in as {me ? <strong>{me.displayName}</strong> : "…"}</span>
      <select value={handle} onChange={(event) => switchTo(event.target.value)}>
        {KNOWN_HANDLES.map((known) => (
          <option key={known} value={known}>
            @{known}
          </option>
        ))}
      </select>
    </label>
  );
}
