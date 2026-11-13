import type { Sdk } from "@durables/schemas";

/** The SDKs Durables accepts activities from: the shared SDK list. */
export type AcceptedSdk = Sdk;

/** Temporal SDKs Durables recognises but does not accept. */
export type UnacceptedSdk = "Java" | "Go" | "PHP";

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
 * The eight facts detection reports about an accepted file: SDK, activity, input and output,
 * runs as, non-retryable errors, configuration read, dependencies and heartbeats. The same
 * shape is stored at publish.
 */
export interface Facts extends ActivityFacts {
  readonly sdk: AcceptedSdk;
}
