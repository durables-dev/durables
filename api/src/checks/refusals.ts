import type { UnacceptedSdk } from "./facts";
import { MAX_CODE_BYTES } from "./size-limit";

// Why the pipeline refused a file. Each refusal is an RFC 9457 Problem Details body with its
// own type, plus any extension members. web branches on `type`, never on the title.

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
export interface NoActivityRefusal {
  readonly type: typeof refusalTypes.noActivity;
  readonly status: 422;
  readonly title: string;
}

/** The file has no Temporal SDK markers, or is empty. */
export interface NotTemporalActivityRefusal {
  readonly type: typeof refusalTypes.notTemporalActivity;
  readonly status: 422;
  readonly title: string;
}

/** The file is a Temporal activity in an SDK Durables doesn't accept. */
export interface UnacceptedSdkRefusal {
  readonly type: typeof refusalTypes.unacceptedSdk;
  readonly status: 422;
  readonly title: string;
  /** The SDK the file is written in. */
  readonly sdk: UnacceptedSdk;
}

/** The file has more than one activity. */
export interface MultipleActivitiesRefusal {
  readonly type: typeof refusalTypes.multipleActivities;
  readonly status: 422;
  readonly title: string;
  /** How many activities the file has. Always 2 or more. */
  readonly count: number;
}

/** The file is over the size limit. */
export interface CodeTooLargeRefusal {
  readonly type: typeof refusalTypes.codeTooLarge;
  readonly status: 413;
  readonly title: string;
  /** The limit, in bytes. */
  readonly limitBytes: number;
}

export type Refusal =
  | NoActivityRefusal
  | NotTemporalActivityRefusal
  | UnacceptedSdkRefusal
  | MultipleActivitiesRefusal
  | CodeTooLargeRefusal;

export const noActivity = (): NoActivityRefusal => ({
  type: refusalTypes.noActivity,
  status: 422,
  title: "No activity found",
});

export const notTemporalActivity = (): NotTemporalActivityRefusal => ({
  type: refusalTypes.notTemporalActivity,
  status: 422,
  title: "Not a Temporal activity",
});

export const unacceptedSdk = (sdk: UnacceptedSdk): UnacceptedSdkRefusal => ({
  type: refusalTypes.unacceptedSdk,
  status: 422,
  title: "SDK not accepted",
  sdk,
});

export const multipleActivities = (
  count: number,
): MultipleActivitiesRefusal => ({
  type: refusalTypes.multipleActivities,
  status: 422,
  title: "More than one activity",
  count,
});

export const codeTooLarge = (): CodeTooLargeRefusal => ({
  type: refusalTypes.codeTooLarge,
  status: 413,
  title: "Code too large",
  limitBytes: MAX_CODE_BYTES,
});
