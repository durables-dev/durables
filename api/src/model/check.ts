// Written from the POC-4 API map, boundary 3 (POST /activities/check).
// Declarations is also the shape of each seed's declaration.json.

export type TagStatus = "present" | "absent" | "not-applicable";

export type Declarations = {
  idempotency: { status: TagStatus; lines: number[] };
  compensation: { status: TagStatus; address?: string };
  heartbeat: { status: TagStatus; reason?: string };
  envVars: { name: string; purpose: string }[];
};

export type CheckTag = "idempotency" | "compensation" | "heartbeat";

export type Check = {
  tag: CheckTag;
  status: TagStatus;
  established: "declared" | "pattern-matched";
  lines?: number[];
  matchedLines?: number[];
  rubricTag?: string;
  address?: string;
  reason?: string;
};
