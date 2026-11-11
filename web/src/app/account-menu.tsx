import { useId, type ToggleEvent } from "react";
import styles from "./account-menu.module.css";
import { useSignOut } from "./use-sign-out";

export interface AccountMenuProps {
  /** The publisher's initials, from the session. Never a provider avatar. */
  initials: string;
}

// Moves focus into the menu as it opens. The browser returns focus to the initials on close.
function focusFirstItem(event: ToggleEvent<HTMLDivElement>) {
  if (event.newState !== "open") return;
  event.currentTarget.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
}

// The publisher's initials in a round badge. Selecting them opens a small menu with one item,
// "Sign out". The menu is a native popover, so Escape and a click outside close it.
export function AccountMenu({ initials }: AccountMenuProps) {
  const menuId = useId();
  const signOut = useSignOut();

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        aria-haspopup="menu"
        aria-label="Account menu"
        className={styles["opener"]}
      >
        <span className={styles["badge"]} aria-hidden="true">
          {initials}
        </span>
      </button>
      <div
        id={menuId}
        popover="auto"
        className={styles["menu"]}
        onToggle={focusFirstItem}
      >
        <ul role="menu" aria-label="Account" className={styles["items"]}>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={styles["item"]}
              disabled={signOut.isPending}
              onClick={() => {
                signOut.mutate();
              }}
            >
              Sign out
            </button>
          </li>
        </ul>
        <p role="status" className={styles["status"]}>
          {signOut.isError ? "Sign-out didn't finish. Try again." : null}
        </p>
      </div>
    </>
  );
}
