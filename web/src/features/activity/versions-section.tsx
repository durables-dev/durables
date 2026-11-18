import { listingPath } from "@/lib/listing-path";
import { publishedAgo } from "@/lib/published-ago";
import { useId } from "react";
import { Link } from "react-router";
import type { ListingAddress } from "./listing-address";
import { versionRows, type ListingVersion } from "./version-rows";
import styles from "./versions-section.module.css";

export interface VersionsSectionProps {
  /** The address of the version being viewed. */
  address: ListingAddress;
  /** Every version, newest first, as the listing read answers them. */
  versions: readonly ListingVersion[];
}

// The Versions section: one row per version, newest first. Each row shows the number, when it
// was published, its What changed note and what it was based on, a red tag when it is
// deprecated, then "Viewing" on the version being viewed or a link to the others' pages.
export function VersionsSection({ address, versions }: VersionsSectionProps) {
  const rows = versionRows(versions, address.version);
  const titleId = useId();
  return (
    <>
      <h2 id={titleId} className={styles["title"]}>
        Versions
      </h2>
      <ol aria-labelledby={titleId} className={styles["list"]}>
        {rows.map((row) => (
          <li
            key={row.version}
            className={
              row.viewing
                ? `${styles["row"]} ${styles["viewed"]}`
                : styles["row"]
            }
            aria-current={row.viewing ? "page" : undefined}
          >
            <div className={styles["number"]}>
              <span className={styles["version"]}>
                {row.version}
                {row.latest ? " · latest" : null}
              </span>
              <time dateTime={row.publishedAt} className={styles["muted"]}>
                {publishedAgo(row.publishedAt)}
              </time>
            </div>
            <div className={styles["details"]}>
              <span className={styles["note"]}>{row.note}</span>
              <span className={styles["muted"]}>{row.lineage}</span>
              {row.deprecated === null ? null : (
                <span className={styles["deprecated"]}>{row.deprecated}</span>
              )}
            </div>
            {row.viewing ? (
              <span className={styles["viewing"]}>Viewing</span>
            ) : (
              <Link
                to={listingPath({ ...address, version: row.version })}
                className={styles["view"]}
              >
                View {row.version}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <p className={styles["caption"]}>
        Each version has its own page and never changes after publishing. A new
        version starts from an earlier one.
      </p>
    </>
  );
}
