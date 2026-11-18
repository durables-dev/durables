import { useId, useState } from "react";
import {
  activitiesIn,
  activityFilters,
  emptyLine,
  filterLabel,
  newestPublishedFirst,
  type ActivityFilter,
} from "./activity-filter";
import { OwnedActivityRow } from "./owned-activity-row";
import type { OwnedActivity } from "./profile-queries";
import styles from "./your-activities.module.css";

export interface YourActivitiesProps {
  /** Every one of the owner's activities, removed ones included. */
  activities: readonly OwnedActivity[];
}

// The owner's activities, newest published first, with an All, Listed and Removed filter.
// Each segment carries its count. A view with nothing in it says so in one muted line.
export function YourActivities({ activities }: YourActivitiesProps) {
  const headingId = useId();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const shown = activitiesIn(newestPublishedFirst(activities), filter);

  return (
    <section aria-labelledby={headingId} className={styles["section"]}>
      <div className={styles["header"]}>
        <h2 id={headingId} className={styles["heading"]}>
          Your activities
        </h2>
        <div role="group" aria-label="Show" className={styles["filter"]}>
          {activityFilters.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === filter}
              className={styles["segment"]}
              onClick={() => {
                setFilter(option);
              }}
            >
              {filterLabel(activities, option)}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className={styles["empty"]}>{emptyLine(filter)}</p>
      ) : (
        <ul aria-labelledby={headingId} className={styles["list"]}>
          {shown.map((activity) => (
            <li key={activity.address} className={styles["item"]}>
              <OwnedActivityRow activity={activity} />
            </li>
          ))}
        </ul>
      )}
      {activities.length === 0 ? null : (
        <p className={styles["caption"]}>
          Open an activity to update it, create a new version, or remove it from
          search.
        </p>
      )}
    </section>
  );
}
