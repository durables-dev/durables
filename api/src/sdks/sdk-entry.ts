import type { Sdk } from "@durables/schemas";
import type { Facts } from "../checks/facts";
import type { CheckedSdk } from "../checks/pipeline";
import type { Address, Snippet } from "../storage/version-document";

// The shape of one SDK registry entry (ADR 0013). Every capability is required, so an entry
// that leaves one out does not compile.

/** Generates an SDK's Implement snippets from its templates. */
export type SnippetGenerator = (facts: Facts, address: Address) => Snippet[];

/**
 * Wording for each way an activity can run, keyed by the `runsAs` fact. It mentions a thread
 * pool only when the SDK's generated worker file sets one up.
 */
export interface RunsAsWording {
  readonly sync: string;
  readonly async: string;
}

/** How an SDK is shown. The SDK catalog publishes this; web holds none of it. */
export interface DisplayProfile {
  /** The package the SDK is installed as, shown beside the SDK on the About card. */
  readonly package: string;
  /** The language its code is highlighted in. */
  readonly highlightLanguage: string;
  /**
   * The file the published code is saved as. The generated files import the activity from
   * it, so the Activity page names the published code's tab and the Source caption with it.
   */
  readonly activityFileName: string;
  /** The Runs as value on the What we found card. */
  readonly runsAs: RunsAsWording;
  /** The Worker requirements sentence in the Activity page's Configure section. */
  readonly workerRequirements: RunsAsWording;
}

/** Everything Durables knows about one Temporal SDK, in one place. */
export interface SdkEntry<S extends Sdk = Sdk> extends CheckedSdk {
  readonly sdk: S;
  /** Generates the Implement snippets. Its templates live beside it in `snippets/templates/`. */
  readonly snippets: SnippetGenerator;
  /**
   * The integration key for a dependency name, as the detector reports it. Integration
   * matching compares this key with each integration's packages.
   */
  readonly normaliseDependency: (name: string) => string;
  readonly display: DisplayProfile;
}

/** The registry: one entry for every SDK in the shared list, keyed by the SDK. */
export type SdkRegistry = { readonly [S in Sdk]: SdkEntry<S> };
