import { type ProblemDetails, ProblemError } from "../http/problem";
import type { AcceptedSdk, UnacceptedSdk } from "./facts";
import { MAX_CODE_BYTES } from "./size-limit";

// Why the pipeline refused a file. Each refusal is thrown as a CheckRefusal, a ProblemError
// whose Problem Details body has its own type plus any extension members. app.onError turns
// it into the response. web branches on `type`, never on the title or detail.
// No refusal ever quotes the code.

const problemType = (slug: string) => `https://durables.dev/problems/${slug}`;

/** The stable Problem Details type of each refusal. */
export const refusalTypes = {
  noActivity: problemType("no-activity"),
  notTemporalActivity: problemType("not-a-temporal-activity"),
  sdkChoiceNeeded: problemType("sdk-choice-needed"),
  unacceptedSdk: problemType("unaccepted-sdk"),
  multipleActivities: problemType("multiple-activities"),
  codeTooLarge: problemType("code-too-large"),
} as const;

/** The SDK was identified or declared, but its detector found no activity in the file. */
export interface NoActivityProblem extends ProblemDetails {
  type: typeof refusalTypes.noActivity;
  status: 422;
  /** The SDK whose detector found no activity. */
  sdk: AcceptedSdk;
}

/** The file is empty or only whitespace. */
export interface NotTemporalActivityProblem extends ProblemDetails {
  type: typeof refusalTypes.notTemporalActivity;
  status: 422;
}

/**
 * Why the publisher must choose the SDK: no SDK could be identified, or several matched and
 * nothing decided between them.
 */
export type SdkChoiceReason = "not-identified" | "ambiguous";

/** The SDK couldn't be identified, and none was declared. The publisher must choose one. */
export interface SdkChoiceNeededProblem extends ProblemDetails {
  type: typeof refusalTypes.sdkChoiceNeeded;
  status: 422;
  reason: SdkChoiceReason;
}

/** The file is a Temporal activity in an SDK Durables doesn't accept. */
export interface UnacceptedSdkProblem extends ProblemDetails {
  type: typeof refusalTypes.unacceptedSdk;
  status: 422;
  /** The SDK the file is written in. */
  sdk: UnacceptedSdk;
}

/** The file has more than one activity. */
export interface MultipleActivitiesProblem extends ProblemDetails {
  type: typeof refusalTypes.multipleActivities;
  status: 422;
  /** How many activities the file has. Always 2 or more. */
  count: number;
}

/** The file is over the size limit. */
export interface CodeTooLargeProblem extends ProblemDetails {
  type: typeof refusalTypes.codeTooLarge;
  status: 413;
  /** The limit, in bytes. */
  limitBytes: number;
}

export type RefusalProblem =
  | NoActivityProblem
  | NotTemporalActivityProblem
  | SdkChoiceNeededProblem
  | UnacceptedSdkProblem
  | MultipleActivitiesProblem
  | CodeTooLargeProblem;

/**
 * The pipeline refused a file. `problem` is the full Problem Details body, extension members
 * included, typed so a caller can narrow on `problem.type`.
 */
export class CheckRefusal extends ProblemError {
  declare readonly problem: RefusalProblem;

  constructor(refusal: RefusalProblem) {
    super(refusal);
    // ProblemError keeps only the standard members. Add the extensions, such as `sdk` and
    // `count`, so they reach the response body too.
    Object.assign(this.problem, refusal);
    this.name = "CheckRefusal";
  }
}

export const noActivity = (sdk: AcceptedSdk) =>
  new CheckRefusal({
    type: refusalTypes.noActivity,
    status: 422,
    title: "No activity found",
    detail: `No ${sdk} activity was found in the file.`,
    sdk,
  });

export const notTemporalActivity = () =>
  new CheckRefusal({
    type: refusalTypes.notTemporalActivity,
    status: 422,
    title: "Not a Temporal activity",
    detail:
      "The file doesn't look like a Python, TypeScript or .NET Temporal activity.",
  });

const sdkChoiceDetails: Record<SdkChoiceReason, string> = {
  "not-identified":
    "Durables couldn't tell which SDK the file is written for. Choose the SDK and check again.",
  ambiguous:
    "The file matches more than one SDK. Choose the SDK it's written for and check again.",
};

export const sdkChoiceNeeded = (reason: SdkChoiceReason) =>
  new CheckRefusal({
    type: refusalTypes.sdkChoiceNeeded,
    status: 422,
    title: "Choose an SDK",
    detail: sdkChoiceDetails[reason],
    reason,
  });

export const unacceptedSdk = (sdk: UnacceptedSdk) =>
  new CheckRefusal({
    type: refusalTypes.unacceptedSdk,
    status: 422,
    title: "SDK not accepted",
    detail: `Durables accepts Python, TypeScript and .NET activities. This file looks like a ${String(sdk)} activity.`,
    sdk,
  });

export const multipleActivities = (count: number) =>
  new CheckRefusal({
    type: refusalTypes.multipleActivities,
    status: 422,
    title: "More than one activity",
    detail: `The file has ${String(count)} activities. Durables publishes one activity per file.`,
    count,
  });

export const codeTooLarge = () =>
  new CheckRefusal({
    type: refusalTypes.codeTooLarge,
    status: 413,
    title: "Code too large",
    detail: `The file is larger than the ${String(MAX_CODE_BYTES / 1024)} KB limit.`,
    limitBytes: MAX_CODE_BYTES,
  });
