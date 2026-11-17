import { profilePath } from "@/lib/account-paths";
import { useId, useRef, type KeyboardEvent, type ToggleEvent } from "react";
import { Link } from "react-router";
import styles from "./account-menu.module.css";
import { useSignOut } from "./use-sign-out";

export interface AccountMenuProps {
  /** The publisher's initials, from the session. Never a provider avatar. */
  initials: string;
}

/** The menu's items that can take focus, in order. A disabled item is skipped. */
function focusableItems(menu: HTMLElement): HTMLElement[] {
  return [
    ...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
  ];
}

// Moves focus into the menu as it opens. The browser returns focus to the initials on close.
function focusFirstItem(event: ToggleEvent<HTMLDivElement>) {
  if (event.newState !== "open") return;
  focusableItems(event.currentTarget)[0]?.focus();
}

// The arrow keys move between the items and wrap. Home and End go to the first and the last.
function moveBetweenItems(event: KeyboardEvent<HTMLUListElement>) {
  const items = focusableItems(event.currentTarget);
  const current = items.findIndex((item) => item === document.activeElement);
  const last = items.length - 1;
  const next = {
    ArrowDown: current >= last ? 0 : current + 1,
    ArrowUp: current <= 0 ? last : current - 1,
    Home: 0,
    End: last,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  items[next]?.focus();
}

// The publisher's initials in a round badge. Selecting them opens a small menu with two items,
// "Your profile" then "Sign out". The menu is a native popover, so Escape and a click outside
// close it.
export function AccountMenu({ initials }: AccountMenuProps) {
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
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
        ref={menu}
        id={menuId}
        popover="auto"
        className={styles["menu"]}
        onToggle={focusFirstItem}
      >
        <ul
          role="menu"
          aria-label="Account"
          tabIndex={-1}
          className={styles["items"]}
          onKeyDown={moveBetweenItems}
        >
          <li role="none">
            <Link
              to={profilePath}
              role="menuitem"
              className={styles["item"]}
              onClick={() => {
                // The header stays on screen as the page changes, so the menu closes itself.
                menu.current?.hidePopover();
              }}
            >
              Your profile
            </Link>
          </li>
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
