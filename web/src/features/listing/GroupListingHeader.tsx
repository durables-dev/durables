import type { GroupListing } from "../../api/types";
import { Badge } from "../../components/Badge";
import { SDK_NAMES } from "../../lib/sdks";
import styles from "./ListingHeader.module.css";

/** The top of a group listing: name, version and address, then the publisher and the Verified Publisher badge. */
export function GroupListingHeader({ listing }: { listing: GroupListing }) {
  const { publisher } = listing;
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <h1 className={styles.name}>{listing.name}</h1>
        <Badge tone="neutral">{listing.version}</Badge>
        <Badge tone="muted">Group</Badge>
        <Badge tone="muted">{SDK_NAMES[listing.sdk]}</Badge>
      </div>
      <p className={styles.address}>
        <code>{listing.address}</code>
      </p>
      <div className={styles.badgeRow}>
        <span className={styles.publisher}>
          by <strong>{publisher.displayName}</strong> <span className={styles.handle}>@{publisher.handle}</span>
        </span>
        {publisher.verified && (
          <span title="Durables has verified this publisher's identity.">
            <Badge tone="success">✓ Verified Publisher</Badge>
          </span>
        )}
      </div>
      <p className={styles.published}>Published {new Date(listing.publishedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
    </header>
  );
}
