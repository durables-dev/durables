import type { Sdk } from "../sdks/sdk-list";

/** The SDKs Durables accepts activities from: the api's SDK list. */
export type AcceptedSdk = Sdk;

/** Temporal SDKs Durables recognises but does not accept. */
export type UnacceptedSdk = "Java" | "Go";

/** A place in the pasted code. Lines are 1-based, numbered as the editor numbers them. */
export interface LineRef {
  readonly line: number;
}

/** Something found by name at a line, such as an environment variable or an import. */
export interface NamedLineRef extends LineRef {
  readonly name: string;
}

/**
 * How the activity runs. Whether a `sync` activity needs a thread pool depends on the SDK, and
 * its display profile says so. Null when detection can't tell.
 */
export type RunsAs = "async" | "sync" | null;

/**
 * What a detector finds about one activity. The SDK is added by the pipeline from the
 * detector that found it. An empty list means detection found none; a null means detection
 * couldn't read it (ADR 0008).
 */
export interface ActivityFacts {
  /** The activity's name, and the line it is declared on. */
  readonly activity: NamedLineRef;
  /** The input type's name. */
  readonly input: string | null;
  /** The output type's name. */
  readonly output: string | null;
  readonly runsAs: RunsAs;
  /** Each place a non-retryable error is raised. */
  readonly nonRetryableErrors: readonly LineRef[];
  /** Each environment variable read, with its line. */
  readonly configurationRead: readonly NamedLineRef[];
  /** Each third-party package imported, with the line of its first import. */
  readonly dependencies: readonly NamedLineRef[];
  /** Each place the activity heartbeats. */
  readonly heartbeats: readonly LineRef[];
}

/**
 * How a fact was established (ADR 0008, amended by ADR 0013).
 *
 * - `detected`: a Temporal marker or a detection pattern found it in the code.
 * - `inferred`: the SDK was recognised from the language and the function's shape, with no
 *   Temporal marker.
 * - `declared`: the publisher named it. Only the SDK can be declared, and the api still runs
 *   that SDK's detector itself.
 * - `pattern-matched`: a behavior check's pattern found it. No fact is pattern-matched yet.
 * - `ai-reviewed`: reserved for AI review. Nothing in the api produces it.
 */
export type Tier =
  "detected" | "inferred" | "declared" | "pattern-matched" | "ai-reviewed";

/** The eight facts, by the name provenance records them under. */
export const factNames = [
  "sdk",
  "activity",
  "inputOutput",
  "runsAs",
  "nonRetryableErrors",
  "configurationRead",
  "dependencies",
  "heartbeats",
] as const;

export type FactName = (typeof factNames)[number];

/**
 * How each of the eight facts was established. `inputOutput` covers both `input` and
 * `output`, which are one fact.
 */
export type Provenance = Readonly<Record<FactName, Tier>>;

/**
 * The eight facts' values: SDK, activity, input and output, runs as, non-retryable errors,
 * configuration read, dependencies and heartbeats. Snippets are generated from these.
 */
export interface FactValues extends ActivityFacts {
  readonly sdk: AcceptedSdk;
}

/**
 * The eight facts detection reports about an accepted file, each with how it was established.
 * The same shape is stored at publish.
 */
export interface Facts extends FactValues {
  readonly provenance: Provenance;
}

/**
 * The facts as a version document holds them. A version published before fact provenance
 * existed has none, and published versions never change.
 */
export interface StoredFacts extends FactValues {
  readonly provenance?: Provenance;
}
