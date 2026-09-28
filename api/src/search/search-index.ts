import type { ActivityVersion } from "../model/activity-version.js";
import type { ActivitySearchFilters } from "../model/search.js";

/**
 * Finds activities by SDK and Temporal behavior. The real one would be a search
 * index that works at scale. Only each activity's default (highest) version is
 * searched.
 */
export interface SearchIndex {
  /** The default version document of every activity matching all the set filters, unsorted. */
  searchActivities(filters: ActivitySearchFilters): Promise<ActivityVersion[]>;
}
