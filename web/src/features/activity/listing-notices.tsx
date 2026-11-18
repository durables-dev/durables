import { listingPath } from "@/lib/listing-path";
import { Link } from "react-router";
import type { ListingAddress } from "./listing-address";
import styles from "./listing-notices.module.css";

export interface DeprecatedNoticeProps {
  address: ListingAddress;
  reason: string;
  /** The version to use instead. Null shows no link. */
  replacement: string | null;
}

// The notice everyone sees on a deprecated version: the version, the publisher's reason and a
// link to the replacement, when there is one.
export function DeprecatedNotice({
  address,
  reason,
  replacement,
}: DeprecatedNoticeProps) {
  return (
    <div role="status" className={styles["notice"]}>
      <p className={styles["text"]}>
        <span className={styles["lead"]}>
          <span className={styles["version"]}>{address.version}</span> is
          deprecated by the publisher
        </span>
        <span>{reason}</span>
      </p>
      {replacement === null ? null : (
        <Link
          to={listingPath({ ...address, version: replacement })}
          className={styles["use"]}
        >
          Use {replacement} instead
        </Link>
      )}
    </div>
  );
}

// The notice everyone sees on every version of an activity taken out of search, whether the
// publisher removed it or their account was deleted.
export function RemovedNotice() {
  return (
    <div role="status" className={styles["notice"]}>
      <p className={styles["text"]}>
        <span>
          <span className={styles["lead"]}>Removed by the publisher.</span> This
          activity no longer appears in search. Its page and every
          version&apos;s address still work, so existing links and workflows
          don&apos;t break.
        </span>
      </p>
    </div>
  );
}

export interface OlderVersionNoticeProps {
  address: ListingAddress;
  /** The latest version, which the notice links to. */
  latest: string;
}

// The notice everyone sees on a version older than the latest, unless that version is
// deprecated, which has its own notice.
export function OlderVersionNotice({
  address,
  latest,
}: OlderVersionNoticeProps) {
  return (
    <div role="status" className={`${styles["notice"]} ${styles["older"]}`}>
      <p className={styles["text"]}>
        <span>
          You&apos;re viewing{" "}
          <span className={`${styles["version"]} ${styles["lead"]}`}>
            {address.version}
          </span>
          , an older version. It stays available at its own address, unchanged.
        </span>
      </p>
      <Link
        to={listingPath({ ...address, version: latest })}
        className={styles["use"]}
      >
        View the latest, {latest}
      </Link>
    </div>
  );
}
