import type { Check, TagStatus } from "../api/types";

// Display names for the evaluation report, shared by the report and the listing's badge row.

export const CHECK_NAMES: Record<Check["tag"], string> = {
  idempotency: "Idempotent",
  compensation: "Compensation",
  heartbeat: "Heartbeats",
  "non-retryable-errors": "Non-retryable errors",
};

export const STATUS_NAMES: Record<TagStatus, string> = {
  present: "Present",
  absent: "Absent",
  "not-applicable": "Not applicable",
};

export const ESTABLISHED_NAMES: Record<Check["established"], string> = {
  detected: "detected",
  declared: "declared by the publisher",
  "pattern-matched": "pattern-matched",
};
