import { request } from "./client";
import type { ActivitySearchFilters, ActivitySearchResponse } from "./types";

/** Step 8. api does all the filtering; unset filters are left out of the query. */
export function searchActivities(filters: ActivitySearchFilters): Promise<ActivitySearchResponse> {
  const query = new URLSearchParams();
  if (filters.sdk) query.set("sdk", filters.sdk);
  if (filters.idempotent) query.set("idempotent", "true");
  if (filters.hasCompensation) query.set("hasCompensation", "true");
  const qs = query.toString();
  return request<ActivitySearchResponse>("GET", `/search/activities${qs ? `?${qs}` : ""}`);
}
