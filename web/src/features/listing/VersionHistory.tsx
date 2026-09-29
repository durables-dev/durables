import { Link } from "react-router";
import type { Listing } from "../../api/types";
import { Badge } from "../../components/Badge";
import { listingPath } from "../../lib/address";
import styles from "./VersionHistory.module.css";

/**
 * Every published version of the activity, highest first, each linked to its
 * own address, with its date and a Latest marker on the default. The version
 * being viewed is marked too.
 */
export function VersionHistory({ listing }: { listing: Listing }) {
  return (
    <ol className={styles.list}>
      {listing.versions.map(({ version, publishedAt }) => (
        <li key={version} className={version === listing.version ? `${styles.item} ${styles.current}` : styles.item}>
          <span className={styles.version}>
            <Link to={listingPath(listing.owner, listing.name, version)}>{version}</Link>
            {version === listing.latestVersion && <Badge tone="success">Latest</Badge>}
            {version === listing.version && <span className={styles.viewing}>viewing</span>}
          </span>
          <span className={styles.date}>{new Date(publishedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
        </li>
      ))}
    </ol>
  );
}
