import type { Detector } from "./detector";
import type { AcceptedSdk, Facts } from "./facts";
import { identifySdk, type Recognisable } from "./identify";
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

/** What the pipeline needs of an accepted SDK: how to recognise it, and its detector. */
export interface CheckedSdk extends Recognisable<AcceptedSdk> {
  readonly detector: Detector;
}

const detect = ({ sdk, detector }: CheckedSdk, source: Source) => {
  try {
    return detector.detect(source);
  } catch (error) {
    throw new DetectorFailure(sdk, error);
  }
};

/**
 * Checks pasted code and returns the activity's facts. The SDK is identified over the given
 * SDKs together with Java, Go and PHP, which are recognised so they can be refused by name.
 * Code identification can't place, or can't decide between SDKs for, is not a Temporal
 * activity.
 *
 * @throws {CheckRefusal} when the file is too large, isn't a Temporal activity, is in an SDK
 * Durables doesn't accept, or has no activity or more than one.
 * @throws {DetectorFailure} when a detector throws.
 */
export const checkCode = (
  code: string,
  checkedSdks: readonly CheckedSdk[],
): Facts => {
  if (!isWithinSizeLimit(code)) {
    throw codeTooLarge();
  }
  if (code.trim() === "") {
    throw notTemporalActivity();
  }

  const source = toSource(code);
  const identification = identifySdk(source.text, [
    ...checkedSdks,
    ...unacceptedSdks,
  ]);
  if (identification.outcome !== "identified") {
    throw notTemporalActivity();
  }
  const checked = checkedSdks.find(({ sdk }) => sdk === identification.sdk);
  if (checked === undefined) {
    const unaccepted = unacceptedSdks.find(
      ({ sdk }) => sdk === identification.sdk,
    );
    throw unaccepted === undefined
      ? notTemporalActivity()
      : unacceptedSdk(unaccepted.sdk);
  }

  const activities = detect(checked, source);
  const [only, ...rest] = activities;
  if (only === undefined) {
    throw noActivity();
  }
  if (rest.length > 0) {
    throw multipleActivities(activities.length);
  }
  return { sdk: checked.sdk, ...only };
};
