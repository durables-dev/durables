import type { Listing } from "../../api/types";
import { Badge } from "../../components/Badge";
import { CHECK_NAMES, ESTABLISHED_NAMES, STATUS_NAMES } from "../../lib/checks";
import styles from "./ListingHeader.module.css";

const SDK_NAMES: Record<Listing["sdk"], string> = { python: "Python" };

/**
 * The top of a listing: name, version and address, then the badge row with the
 * publisher (and the Verified Publisher badge) and an at-a-glance summary of the
 * evaluation report.
 */
export function ListingHeader({ listing }: { listing: Listing }) {
  const { publisher } = listing;
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <h1 className={styles.name}>{listing.name}</h1>
        <Badge tone="neutral">{listing.version}</Badge>
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
        <span className={styles.divider} />
        {listing.checks.map((check) => (
          <span key={check.tag} title={`${STATUS_NAMES[check.status]}, ${ESTABLISHED_NAMES[check.established]}`}>
            <Badge tone={check.status === "present" ? "success" : "muted"}>
              {check.status === "present" ? "✓" : check.status === "absent" ? "✗" : "–"} {CHECK_NAMES[check.tag]}
            </Badge>
          </span>
        ))}
      </div>
      <p className={styles.published}>Published {new Date(listing.publishedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
    </header>
  );
}
