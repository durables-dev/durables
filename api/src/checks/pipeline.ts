import type { Detector, SdkMarkers } from "./detector";
import type { AcceptedSdk, Facts, UnacceptedSdk } from "./facts";
import { matchesAny } from "./pattern";
import {
  codeTooLarge,
  multipleActivities,
  noActivity,
  notTemporalActivity,
  unacceptedSdk,
} from "./refusals";
import { isWithinSizeLimit } from "./size-limit";
import { type Source, toSource } from "./source";
import { unacceptedSdks } from "./unaccepted-sdks";

// The checks pipeline (ADR 0008): pasted code in, the activity's facts out, or a CheckRefusal
// thrown. It never logs, and nothing it throws carries the code.

/**
 * A detector threw. The message names the SDK and the original error's name only, never its
 * message or stack, which could quote the code.
 */
export class DetectorFailure extends Error {
  readonly sdk: AcceptedSdk;

  constructor(sdk: AcceptedSdk, original: unknown) {
    const name = original instanceof Error ? original.name : typeof original;
    super(`The ${sdk} detector failed with ${name}`);
    this.name = "DetectorFailure";
    this.sdk = sdk;
  }
}

type Candidate =
  | { readonly accepted: true; readonly markers: Detector }
  | {
      readonly accepted: false;
      readonly markers: SdkMarkers<UnacceptedSdk>;
    };

/**
 * Chooses the file's SDK. One SDK with markers is that SDK. Among several, the one with an
 * activity marker wins, taking the earliest in `candidates` if more than one has. None, or
 * several with no activity marker, is no SDK.
 */
const chooseSdk = (
  text: string,
  candidates: readonly Candidate[],
): Candidate | undefined => {
  const marked = candidates.filter(({ markers }) =>
    matchesAny(markers.sdkMarkers, text),
  );
  if (marked.length <= 1) {
    return marked[0];
  }
  return marked.find(({ markers }) =>
    matchesAny(markers.activityMarkers, text),
  );
};

const detect = (detector: Detector, source: Source) => {
  try {
    return detector.detect(source);
  } catch (error) {
    throw new DetectorFailure(detector.sdk, error);
  }
};

/**
 * Checks pasted code and returns the activity's facts. Accepted SDKs are recognised through
 * `detectors`; Java, Go and PHP are recognised so they can be refused by name.
 *
 * @throws {CheckRefusal} when the file is too large, isn't a Temporal activity, is in an SDK
 * Durables doesn't accept, or has no activity or more than one.
 * @throws {DetectorFailure} when a detector throws.
 */
export const checkCode = (
  code: string,
  detectors: readonly Detector[],
): Facts => {
  if (!isWithinSizeLimit(code)) {
    throw codeTooLarge();
  }
  if (code.trim() === "") {
    throw notTemporalActivity();
  }

  const source = toSource(code);
  const candidates: Candidate[] = [
    ...detectors.map((markers) => ({ accepted: true as const, markers })),
    ...unacceptedSdks.map((markers) => ({ accepted: false as const, markers })),
  ];
  const chosen = chooseSdk(source.text, candidates);
  if (chosen === undefined) {
    throw notTemporalActivity();
  }
  if (!chosen.accepted) {
    throw unacceptedSdk(chosen.markers.sdk);
  }

  const detector = chosen.markers;
  const activities = detect(detector, source);
  const [only, ...rest] = activities;
  if (only === undefined) {
    throw noActivity();
  }
  if (rest.length > 0) {
    throw multipleActivities(activities.length);
  }
  return { sdk: detector.sdk, ...only };
};
