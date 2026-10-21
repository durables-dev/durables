import type { AcceptedSdk, ActivityFacts, UnacceptedSdk } from "./facts";
import type { Pattern } from "./pattern";
import type { Source } from "./source";

/** How the pipeline recognises one Temporal SDK. */
export interface SdkMarkers<S extends AcceptedSdk | UnacceptedSdk> {
  readonly sdk: S;
  /** Patterns that show the file uses this SDK. Any one matching is enough. */
  readonly sdkMarkers: readonly Pattern[];
  /**
   * Patterns that show the file declares an activity in this SDK. Used to choose between
   * SDKs when a file has markers for more than one.
   */
  readonly activityMarkers: readonly Pattern[];
}

/**
 * Detection for one accepted SDK. The pipeline chooses the SDK from the markers, then asks
 * that SDK's detector for the file's activities.
 */
export interface Detector extends SdkMarkers<AcceptedSdk> {
  /** Every activity in the file, in the order they appear. Empty when there is none. */
  detect(source: Source): readonly ActivityFacts[];
}
