// Written from the POC-7 API map, boundaries 1 and 2 (GET /search/activities).

import type { Check, CheckTag, TagStatus } from "./check.js";
import type { Sdk } from "./detection.js";

/** The SDK choice offers all three. Until TypeScript and .NET detection arrive (POC-8), only Python has results. */
export type SearchSdk = "python" | "typescript" | "dotnet";

/** Filters combine with AND. An unset filter doesn't constrain. */
export type ActivitySearchFilters = {
  sdk?: SearchSdk;
  /** The idempotency check's status is `present`, however it was established. */
  idempotent?: true;
  /** The compensation check's status is `present`. */
  hasCompensation?: true;
};

export type ActivitySummary = {
  /** The default version's address: "durables.dev/kisasa/charge-card@1.0.0". */
  address: string;
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  sdk: Sdk;
  /** Detected: "charge_card". */
  activityName: string;
  publisher: { handle: string; displayName: string; verified: boolean };
  /** In stored order. */
  checks: { tag: CheckTag; status: TagStatus; established: Check["established"] }[];
};

export type ActivitySearchResponse = {
  /** As api read them from the query. */
  filters: ActivitySearchFilters;
  /** By name, then owner, ascending. */
  results: ActivitySummary[];
};
