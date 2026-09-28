// Written from the POC-4 to POC-8 API maps. Never imported from api/.

export type Me = { handle: string; displayName: string };

// Boundary 2: POST /activities/detect (POC-8: every SDK)

export type Sdk = "python" | "typescript" | "dotnet";

export type Located<T> = { value: T; line: number };

export type Detection = {
  sdk: Located<Sdk>;
  activityName: Located<string>;
  inputTypes: { name: string; type: string; line: number }[];
  /** Unwrapped: Promise<T> and Task<T> arrive as T, a bare Task as "void". */
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

// Boundary 4: GET /rubric (POC-8: one idempotency entry per SDK)

export type RubricEntry = {
  tag: "idempotency";
  sdk: Sdk;
  /** The entry's id on /rubric, and the value of Check.rubricTag. */
  anchor: string;
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
  /** Monaco language ids. */
  language: "shell" | "python" | "typescript" | "csharp";
  content: string;
};

export type Listing = {
  address: string;
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  publisher: { handle: string; displayName: string; verified: boolean };
  sdk: Sdk;
  code: string;
  /** The stored detection, shown in the Detected panel. */
  detection: Detection;
  snippets: Snippet[];
  configuration: { name: string; purpose: string; line: number }[];
  readme: string;
  checks: Check[];
};

// POC-6 boundary 1: POST /groups/resolve

/** Groups stay Python-only (POC-8 API map). */
export type GroupSdk = "python";

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
  sdk: GroupSdk;
  file: string;
  members: GroupMember[];
  /** The imports header and each whole block, markers included. */
  readOnlyRanges: LineRange[];
  problems: GroupProblem[];
};

// POC-6 boundary 2: POST /groups (publish)

export type PublishGroupRequest = { name: string; sdk: GroupSdk; source: string };

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
  sdk: GroupSdk;
  /** "payments.py" */
  filename: string;
  /** Exactly what the copy button copies. */
  file: string;
  members: { address: string; owner: string; name: string; version: string }[];
};

// POC-7 boundary 1: GET /search/activities

export type SearchSdk = Sdk;

/** Filters combine with AND. An unset filter doesn't constrain. */
export type ActivitySearchFilters = {
  sdk?: SearchSdk;
  idempotent?: true;
  hasCompensation?: true;
};

export type ActivitySummary = {
  /** The default version: "durables.dev/kisasa/charge-card@1.0.0". */
  address: string;
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  sdk: Sdk;
  /** Detected: "charge_card". */
  activityName: string;
  publisher: { handle: string; displayName: string; verified: boolean };
  checks: Pick<Check, "tag" | "status" | "established">[];
};

export type ActivitySearchResponse = {
  /** As api read them from the query. */
  filters: ActivitySearchFilters;
  /** By name, then owner, ascending. */
  results: ActivitySummary[];
};
