import type { BrowseResponse } from "./activity-card";

/**
 * The line above the results: "10 activities · sorted by newest". The count is every match
 * the endpoint reports, not only the cards loaded so far. The sort is the one it used.
 */
export function countLine(count: number, sort: BrowseResponse["sort"]): string {
  const noun = count === 1 ? "activity" : "activities";
  return `${count.toLocaleString("en")} ${noun} · sorted by ${sort}`;
}
