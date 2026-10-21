import { type ProblemDetails, ProblemError } from "../http/problem";
import type { UnacceptedSdk } from "./facts";
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
  unacceptedSdk: problemType("unaccepted-sdk"),
  multipleActivities: problemType("multiple-activities"),
  codeTooLarge: problemType("code-too-large"),
} as const;

/** The SDK was recognised, but the file has no activity in it. */
export interface NoActivityProblem extends ProblemDetails {
  type: typeof refusalTypes.noActivity;
  status: 422;
}

/** The file has no Temporal SDK markers, or is empty. */
export interface NotTemporalActivityProblem extends ProblemDetails {
  type: typeof refusalTypes.notTemporalActivity;
  status: 422;
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

export const noActivity = () =>
  new CheckRefusal({
    type: refusalTypes.noActivity,
    status: 422,
    title: "No activity found",
    detail: "The file uses a Temporal SDK but has no activity in it.",
  });

export const notTemporalActivity = () =>
  new CheckRefusal({
    type: refusalTypes.notTemporalActivity,
    status: 422,
    title: "Not a Temporal activity",
    detail:
      "The file doesn't look like a Python, TypeScript or .NET Temporal activity.",
  });

export const unacceptedSdk = (sdk: UnacceptedSdk) =>
  new CheckRefusal({
    type: refusalTypes.unacceptedSdk,
    status: 422,
    title: "SDK not accepted",
    detail: `Durables accepts Python, TypeScript and .NET activities. This file looks like a ${sdk} activity.`,
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
