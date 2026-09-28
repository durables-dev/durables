// Written from the POC-4 API map, boundary 3 (POST /activities/check), and
// extended by the POC-5 API map, boundary 3 (the non-retryable-errors check).
// Declarations is also the shape of each seed's declaration.json.

export type TagStatus = "present" | "absent" | "not-applicable";

export type Declarations = {
  idempotency: { status: TagStatus; lines: number[] };
  compensation: { status: TagStatus; address?: string };
  heartbeat: { status: TagStatus; reason?: string };
  envVars: { name: string; purpose: string }[];
};

export type CheckTag = "idempotency" | "compensation" | "heartbeat" | "non-retryable-errors";

export type Check = {
  tag: CheckTag;
  status: TagStatus;
  established: "detected" | "declared" | "pattern-matched";
  /** idempotency: the cited lines. non-retryable-errors: the lines each type was detected on. */
  lines?: number[];
  matchedLines?: number[];
  rubricTag?: string;
  address?: string;
  reason?: string;
  /** non-retryable-errors: the detected error types, e.g. ["CardDeclined"]. */
  errorTypes?: string[];
};
