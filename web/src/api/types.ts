// Written from the POC-4 API map. Never imported from api/.

export type Me = { handle: string; displayName: string };

// Boundary 2: POST /activities/detect

export type Located<T> = { value: T; line: number };

export type Detection = {
  sdk: Located<"python">;
  activityName: Located<string>;
  inputTypes: { name: string; type: string; line: number }[];
  outputType: Located<string>;
  nonRetryableErrorTypes: Located<string>[];
  envVars: Located<string>[];
};

// Boundary 3: POST /activities/check

export type TagStatus = "present" | "absent" | "not-applicable";

export type Declarations = {
  idempotency: { status: TagStatus; lines: number[] };
  compensation: { status: TagStatus; address?: string };
  heartbeat: { status: TagStatus; reason?: string };
  envVars: { name: string; purpose: string }[];
};

export type Check = {
  tag: "idempotency" | "compensation" | "heartbeat";
  status: TagStatus;
  established: "declared" | "pattern-matched";
  lines?: number[];
  matchedLines?: number[];
  rubricTag?: string;
  address?: string;
  reason?: string;
};

// Boundary 4: GET /rubric

export type RubricEntry = {
  tag: "idempotency";
  sdk: "python";
  description: string;
  patterns: string[];
};
