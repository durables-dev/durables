import type { Detector } from "./detector";
import type { AcceptedSdk, Facts, Provenance, Tier } from "./facts";
import { identifySdk, type Recognisable } from "./identify";
import {
  codeTooLarge,
  multipleActivities,
  noActivity,
  notTemporalActivity,
  sdkChoiceNeeded,
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

/**
 * What the pipeline needs of an accepted SDK: how to recognise it, its detector and its
 * standard-library check.
 */
export interface CheckedSdk extends Recognisable<AcceptedSdk> {
  readonly detector: Detector;
  /**
   * Whether a dependency name, as the detector reports it, is part of the language's own
   * library rather than a third-party package. Detection leaves these out of Dependencies.
   */
  readonly isStandardLibrary: (name: string) => boolean;
}

const detect = (
  { sdk, detector, isStandardLibrary }: CheckedSdk,
  source: Source,
) => {
  try {
    return detector.detect(source, isStandardLibrary);
  } catch (error) {
    throw new DetectorFailure(sdk, error);
  }
};

/**
 * How each fact was established. The SDK's tier comes from identification or declaration.
 * The detector reads every other fact from the code, so each of those is detected.
 */
const provenanceFor = (sdkTier: Tier): Provenance => ({
  sdk: sdkTier,
  activity: "detected",
  inputOutput: "detected",
  runsAs: "detected",
  nonRetryableErrors: "detected",
  configurationRead: "detected",
  dependencies: "detected",
  heartbeats: "detected",
});

/** The SDK to run detection with, and how it was established. */
interface ChosenSdk {
  readonly checked: CheckedSdk;
  readonly tier: Tier;
}

/**
 * Identifies the SDK over the given SDKs together with PHP, which is recognised so it can be
 * refused by name.
 */
const identifyChecked = (
  source: Source,
  checkedSdks: readonly CheckedSdk[],
): ChosenSdk => {
  const identification = identifySdk(source.text, [
    ...checkedSdks,
    ...unacceptedSdks,
  ]);
  if (identification.outcome !== "identified") {
    throw sdkChoiceNeeded(identification.outcome);
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
  return { checked, tier: identification.tier };
};

/** The declared SDK's entry. Every SDK in the api's list has one in production. */
const declaredChecked = (
  declared: AcceptedSdk,
  checkedSdks: readonly CheckedSdk[],
): ChosenSdk => {
  const checked = checkedSdks.find(({ sdk }) => sdk === declared);
  if (checked === undefined) {
    throw new Error(`No detector is given for the declared SDK ${declared}.`);
  }
  return { checked, tier: "declared" };
};

/**
 * Checks pasted code and returns the activity's facts, with how each was established.
 *
 * With no declared SDK, the SDK is identified from the code. Code identification can't place,
 * or can't decide between SDKs for, needs the publisher to choose the SDK. With a declared
 * SDK, identification is skipped and that SDK's detector decides alone. Only the SDK is ever
 * declared: every other fact comes from the detector.
 *
 * @throws {CheckRefusal} when the file is too large or empty, needs the SDK chosen, is in an
 * SDK Durables doesn't accept, or has no activity or more than one.
 * @throws {DetectorFailure} when a detector throws.
 */
export const checkCode = (
  code: string,
  checkedSdks: readonly CheckedSdk[],
  declared?: AcceptedSdk,
): Facts => {
  if (!isWithinSizeLimit(code)) {
    throw codeTooLarge();
  }
  if (code.trim() === "") {
    throw notTemporalActivity();
  }

  const source = toSource(code);
  const { checked, tier } =
    declared === undefined
      ? identifyChecked(source, checkedSdks)
      : declaredChecked(declared, checkedSdks);

  const activities = detect(checked, source);
  const [only, ...rest] = activities;
  if (only === undefined) {
    throw noActivity(checked.sdk);
  }
  if (rest.length > 0) {
    throw multipleActivities(activities.length);
  }
  return { sdk: checked.sdk, ...only, provenance: provenanceFor(tier) };
};
