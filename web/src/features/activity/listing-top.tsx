import { AddressCopy } from "./address-copy";
import styles from "./listing-top.module.css";
import { publishedAgo } from "./published-ago";
import { scrollToSection } from "./scroll-to-section";
import { sectionHref } from "./listing-sections";

export interface ListingTopProps {
  title: string;
  /** "Python", "TypeScript" or ".NET". */
  sdk: string;
  address: string;
  /** The listing's current one-line description. Empty shows no description line. */
  description: string;
  handle: string;
  /** When the version was published, as an ISO 8601 timestamp. */
  publishedAt: string;
}

// The top of the Activity page: the icon, the title and SDK, the address with its copy
// button, the description, the publisher line, and Quickstart at the right.
export function ListingTop({
  title,
  sdk,
  address,
  description,
  handle,
  publishedAt,
}: ListingTopProps) {
  return (
    <header className={styles["top"]}>
      <div className={styles["identity"]}>
        <span className={styles["icon"]} aria-hidden="true">
          <svg width="60%" height="60%" viewBox="0 0 100 100">
            <path d="M14 18 H58 V36 L82 28 V72 L58 64 V82 H14 Z" />
          </svg>
        </span>
        <div className={styles["details"]}>
          <div className={styles["heading"]}>
            <h1 className={styles["title"]}>{title}</h1>
            <p className={styles["sdk"]}>{sdk}</p>
          </div>
          <AddressCopy address={address} />
          {description === "" ? null : (
            <p className={styles["description"]}>{description}</p>
          )}
          <p className={styles["publisher"]}>
            <span className={styles["handle"]}>
              <span className={styles["initial"]} aria-hidden="true">
                {handle.charAt(0).toUpperCase()}
              </span>
              <span>{handle}</span>
            </span>
            <span>
              Published{" "}
              <time dateTime={publishedAt}>{publishedAgo(publishedAt)}</time>
            </span>
            <span>MIT-0</span>
          </p>
        </div>
      </div>
      <a
        href={sectionHref("implement")}
        className={styles["quickstart"]}
        onClick={(event) => {
          scrollToSection("implement", event);
        }}
      >
        Quickstart
      </a>
    </header>
  );
}
