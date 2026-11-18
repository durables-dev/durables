import type { OwnedActivity } from "./profile-queries";

/** The three views of Your activities, in the order the filter shows them. */
export const activityFilters = ["all", "listed", "removed"] as const;

export type ActivityFilter = (typeof activityFilters)[number];

const filterLabels: Record<ActivityFilter, string> = {
  all: "All",
  listed: "Listed",
  removed: "Removed",
};

/** What a view shows when it has nothing in it. */
const emptyLines: Record<ActivityFilter, string> = {
  all: "You haven't published an activity yet.",
  listed: "Nothing listed.",
  removed: "Nothing removed from search.",
};

/** The owner's activities, newest published first. Activities published together keep their order. */
export function newestPublishedFirst(
  activities: readonly OwnedActivity[],
): OwnedActivity[] {
  return [...activities].sort(
    (a, b) =>
      new Date(b.latestPublishedAt).getTime() -
      new Date(a.latestPublishedAt).getTime(),
  );
}

/** Whether an activity belongs in a view. */
function inView(activity: OwnedActivity, filter: ActivityFilter): boolean {
  return filter === "all" || activity.status === filter;
}

/** The activities a view shows, in the order given. */
export function activitiesIn(
  activities: readonly OwnedActivity[],
  filter: ActivityFilter,
): OwnedActivity[] {
  return activities.filter((activity) => inView(activity, filter));
}

/** A filter segment's label with its count, such as "Listed (4)". */
export function filterLabel(
  activities: readonly OwnedActivity[],
  filter: ActivityFilter,
): string {
  return `${filterLabels[filter]} (${String(activitiesIn(activities, filter).length)})`;
}

/** The one muted line a view shows when nothing is in it. */
export function emptyLine(filter: ActivityFilter): string {
  return emptyLines[filter];
}

/** An activity's version count and age, such as "3 versions · latest published 2 days ago". */
export function versionsLine(
  versionCount: number,
  publishedAgo: string,
): string {
  const versions = versionCount === 1 ? "version" : "versions";
  return `${String(versionCount)} ${versions} · latest published ${publishedAgo}`;
}
