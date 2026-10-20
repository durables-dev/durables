import { contributeEntryState } from "@/lib/contribute-origin";
import { useSessionUser } from "@/lib/use-session-user";
import { Link, useLocation } from "react-router";
import { AccountMenu } from "./account-menu";
import styles from "./site-header.module.css";

// The mark files live in public/, so they load from our own origin as the page security
// policy requires. Each carries its own background, so the theme picks the file.
const markOnInk = "/durables-mark-on-ink.svg";
const markOnCream = "/durables-mark-on-cream.svg";

export interface SiteHeaderProps {
  /** False leaves out the Contribute button, as on the Contribute pages. Defaults to true. */
  contribute?: boolean;
}

// The logo at the left. At the right, the Contribute button and, once signed in, the
// publisher's initials, which open the account menu. The Contribute link tells the flow which
// page it was followed from, so the flow's Back can return there.
export function SiteHeader({ contribute = true }: SiteHeaderProps) {
  const user = useSessionUser();
  const location = useLocation();

  return (
    <header className={styles["header"]}>
      <Link to="/" aria-label="Durables home" className={styles["home"]}>
        <picture>
          <source srcSet={markOnCream} media="(prefers-color-scheme: light)" />
          <img
            src={markOnInk}
            alt=""
            width={28}
            height={28}
            className={styles["mark"]}
          />
        </picture>
        <span className={styles["wordmark"]}>Durables</span>
      </Link>
      {contribute || user ? (
        <div className={styles["actions"]}>
          {contribute ? (
            <Link
              to="/contribute"
              state={contributeEntryState(location)}
              className={styles["contribute"]}
            >
              Contribute
            </Link>
          ) : null}
          {user ? <AccountMenu initials={user.initials} /> : null}
        </div>
      ) : null}
    </header>
  );
}
