import { Link } from "react-router";
import styles from "./site-header.module.css";

// The mark files live in public/, so they load from our own origin as the page security
// policy requires. Each carries its own background, so the theme picks the file.
const markOnInk = "/durables-mark-on-ink.svg";
const markOnCream = "/durables-mark-on-cream.svg";

export function SiteHeader() {
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
    </header>
  );
}
