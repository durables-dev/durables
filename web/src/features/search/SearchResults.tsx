import { Link } from "react-router";
import type { ActivitySummary } from "../../api/types";
import { Badge } from "../../components/Badge";
import { CheckBadge } from "../../components/CheckBadge";
import { listingPath } from "../../lib/address";
import { SDK_NAMES } from "../../lib/sdks";
import styles from "./SearchResults.module.css";

/** One row per matching activity's default version, in api's order (name, then owner). */
export function SearchResults({ results }: { results: ActivitySummary[] }) {
  if (results.length === 0) {
    return <p className={styles.empty}>No activities match these filters.</p>;
  }
  return (
    <>
      <p className={styles.count}>
        {results.length} {results.length === 1 ? "activity" : "activities"}
      </p>
      <ul className={styles.list}>
        {results.map((result) => (
          <li key={result.address} className={styles.item}>
            <div className={styles.titleRow}>
              <Link to={listingPath(result.owner, result.name, result.version)} className={styles.name}>
                {result.name}
              </Link>
              <Badge tone="neutral">{result.version}</Badge>
              <Badge tone="muted">{SDK_NAMES[result.sdk]}</Badge>
            </div>
            <p className={styles.address}>
              <code>{result.address}</code>
            </p>
            <div className={styles.badgeRow}>
              <span className={styles.publisher}>
                by <strong>{result.publisher.displayName}</strong>{" "}
                <span className={styles.handle}>@{result.publisher.handle}</span>
              </span>
              {result.publisher.verified && (
                <span title="Durables has verified this publisher's identity.">
                  <Badge tone="success">✓ Verified Publisher</Badge>
                </span>
              )}
            </div>
            <div className={styles.badgeRow}>
              {result.checks.map((check) => (
                <CheckBadge key={check.tag} check={check} showEstablished />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
