// Written from the POC-4, POC-5 and POC-6 API maps. Never imported from api/.

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
  tag: "idempotency" | "compensation" | "heartbeat" | "non-retryable-errors";
  status: TagStatus;
  established: "detected" | "declared" | "pattern-matched";
  /** idempotency: the cited lines. non-retryable-errors: the detected lines. Each is an evidence link. */
  lines?: number[];
  matchedLines?: number[];
  rubricTag?: string;
  /** compensation: linked to /<owner>/<name> through parseAddress(). */
  address?: string;
  reason?: string;
  /** non-retryable-errors: e.g. ["CardDeclined"]. */
  errorTypes?: string[];
};

// Boundary 4: GET /rubric

export type RubricEntry = {
  tag: "idempotency";
  sdk: "python";
  description: string;
  patterns: string[];
};

// POC-5 boundary 1: GET /readme-template

export type ReadmeTemplate = { markdown: string; requiredHeadings: string[] };

// POC-5 boundary 2: POST /activities (publish)

export type PublishRequest = {
  code: string;
  declarations: Declarations;
  readme: string;
  exampleInput: Record<string, unknown>;
};

export type PublishResult = { address: string; owner: string; name: string; version: string };

/** The 400 body when publishing fails. */
export type PublishError = { error: string; missingHeadings?: string[] };

// POC-5 boundary 3: GET /activities/:owner/:name[/:version] (the listing)

export type Snippet = {
  tab: "install" | "activity" | "workflow" | "worker" | "starter";
  filename?: string;
  language: "shell" | "python";
  content: string;
};

export type Listing = {
  address: string;
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  publisher: { handle: string; displayName: string; verified: boolean };
  sdk: "python";
  code: string;
  snippets: Snippet[];
  configuration: { name: string; purpose: string; line: number }[];
  readme: string;
  checks: Check[];
};

// POC-6 boundary 1: POST /groups/resolve

export type LineRange = { startLine: number; endLine: number };

export type GroupMember = {
  /** Always pinned: "durables.dev/kisasa/charge-card@1.0.0". */
  address: string;
  owner: string;
  name: string;
  version: string;
  /** The block's lines in `file`, markers included. */
  range: LineRange;
};

export type GroupProblem = {
  line: number;
  kind: "unknown-address" | "wrong-sdk" | "other-publisher" | "name-collision";
  message: string;
};

export type ResolvedGroup = {
  sdk: "python";
  file: string;
  members: GroupMember[];
  /** The imports header and each whole block, markers included. */
  readOnlyRanges: LineRange[];
  problems: GroupProblem[];
};

// POC-6 boundary 2: POST /groups (publish)

export type PublishGroupRequest = { name: string; sdk: "python"; source: string };

export type PublishGroupResult = { address: string; owner: string; name: string; version: string };

/** The 400 body when publishing a group fails. */
export type PublishGroupError = { error: string; problems?: GroupProblem[] };

// POC-6 boundary 3: GET /groups/:owner/:name[/:version] (the group listing)

export type GroupListing = {
  address: string;
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  publisher: { handle: string; displayName: string; verified: boolean };
  sdk: "python";
  /** "payments.py" */
  filename: string;
  /** Exactly what the copy button copies. */
  file: string;
  members: { address: string; owner: string; name: string; version: string }[];
};
