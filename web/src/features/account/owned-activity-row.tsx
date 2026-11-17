import { ActivityTile } from "@/components/activity-tile";
import { listingPath } from "@/lib/listing-path";
import { publishedAgo } from "@/lib/published-ago";
import { Link } from "react-router";
import { versionsLine } from "./activity-filter";
import styles from "./owned-activity-row.module.css";
import type { OwnedActivity } from "./profile-queries";

export interface OwnedActivityRowProps {
  activity: OwnedActivity;
}

const statusLabels = {
  listed: "Listed",
  removed: "Removed from search",
} as const;

// One of the owner's activities: its icon, its title linking to the latest version's page,
// its SDK, the latest address, how many versions it has and when the latest was published,
// and whether it is in search. The status chip is Lagoon when listed and neutral when
// removed, never red.
export function OwnedActivityRow({ activity }: OwnedActivityRowProps) {
  return (
    <div className={styles["row"]}>
      <ActivityTile title={activity.title} handle={activity.handle} />
      <div className={styles["identity"]}>
        <p className={styles["titleLine"]}>
          <Link to={listingPath(activity)} className={styles["title"]}>
            {activity.title}
          </Link>
          <span className={styles["sdk"]}>{activity.sdk}</span>
        </p>
        <p className={styles["address"]} title={activity.address}>
          {activity.address}
        </p>
        <p className={styles["meta"]}>
          {versionsLine(
            activity.versionCount,
            publishedAgo(activity.latestPublishedAt),
          )}
        </p>
      </div>
      <span className={`${styles["status"]} ${styles[activity.status]}`}>
        {statusLabels[activity.status]}
      </span>
    </div>
  );
}
