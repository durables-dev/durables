import type { ProblemDetails } from "@/lib/problem";
import { z } from "zod";
import type { SdkName } from "@/lib/sdk-catalog";
import {
  sdkTier,
  type CheckedFacts,
  type CheckResult,
  type SdkTier,
} from "./check-result";

// What the line under the paste editor says about the latest check. Refusals are told apart
// by their Problem Details type, never by their title or detail (web/CONVENTIONS.md, Data).
// The types are the API's (api: checks/refusals.ts).

/** The Problem Details type of each refusal the check answers. */
export const refusalTypes = {
  noActivity: "https://durables.dev/problems/no-activity",
  notTemporalActivity: "https://durables.dev/problems/not-a-temporal-activity",
  sdkChoiceNeeded: "https://durables.dev/problems/sdk-choice-needed",
  multipleActivities: "https://durables.dev/problems/multiple-activities",
  codeTooLarge: "https://durables.dev/problems/code-too-large",
} as const;

/** A refusal is about the file, so the draft keeps it with the code. */
const fileRefusalSchema = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal(refusalTypes.noActivity),
    sdk: z.string().min(1).optional(),
  }),
  z.looseObject({ type: z.literal(refusalTypes.notTemporalActivity) }),
  z.looseObject({
    type: z.literal(refusalTypes.sdkChoiceNeeded),
    reason: z.enum(["not-identified", "ambiguous"]),
  }),
  z.looseObject({
    type: z.literal(refusalTypes.multipleActivities),
    count: z.number().int().min(2),
  }),
  z.looseObject({ type: z.literal(refusalTypes.codeTooLarge) }),
]);

type FileRefusal = z.infer<typeof fileRefusalSchema>;

/** The line under the editor. */
export type CheckLine =
  | { kind: "none" }
  | { kind: "checking"; text: string }
  | { kind: "found"; text: string; facts: CheckedFacts }
  | { kind: "refused"; text: string }
  | { kind: "failed"; text: string };

/**
 * The SDK control in the row under the editor. `change`: the Found line's SDK name is a link
 * that turns into a dropdown. `choose`: the publisher must choose the SDK from a dropdown,
 * which shows the SDK they chose last, if any.
 */
export type SdkControl =
  | { kind: "none" }
  | { kind: "change"; sdk: string }
  | { kind: "choose"; chosen: SdkName | undefined };

export const checkingText = "Checking…";

/** Said when the check could not run, as when the network fails or the API answers 500. */
export const failedText =
  "The check couldn't run. Paste the file again to retry.";

/** Said above the dropdown when the api can't tell which SDK the code is for. */
export const chooseSdkText =
  "We couldn't tell which SDK this is. Choose the one it's written for.";

/** Said beside Continue while the publisher must choose the SDK. */
export const chooseSdkHint = "Choose the SDK this activity is for";

const tooLargeText = "This file is too large to check. The limit is 100 KB.";

const tooManyText =
  "Too many checks in a short time. Wait a minute and try again.";

/** How the Found line says the SDK was established. Detected says nothing. */
const tierPhrase: Record<SdkTier, string> = {
  detected: "",
  inferred: ", inferred from the code",
  declared: ", declared by you",
};

/**
 * The Found line in three parts, so the SDK name between them can be a link: what comes
 * before the name, the name, and what comes after it.
 */
export function foundParts(facts: CheckedFacts): [string, string, string] {
  return [
    `✓ Found ${facts.activity.name} (`,
    facts.sdk,
    `${tierPhrase[sdkTier(facts)]}). Next, check what we detected.`,
  ];
}

/** The Found line for an accepted file. */
export function foundText(facts: CheckedFacts): string {
  return foundParts(facts).join("");
}

function refusalText(
  refusal: FileRefusal,
  declaredSdk: SdkName | undefined,
): string {
  switch (refusal.type) {
    case refusalTypes.noActivity:
      return declaredSdk === undefined
        ? "Found the SDK but no activity function with typed input and output."
        : `No activity found for ${refusal.sdk ?? declaredSdk}. Check the code, or choose a different SDK.`;
    case refusalTypes.notTemporalActivity:
      return "This doesn't look like a Temporal activity in any SDK Durables supports.";
    case refusalTypes.sdkChoiceNeeded:
      return chooseSdkText;
    case refusalTypes.multipleActivities:
      return `This file has ${String(refusal.count)} activities. Durables publishes one activity per file. Paste a file with only the one you want to share.`;
    case refusalTypes.codeTooLarge:
      return tooLargeText;
  }
}

/**
 * Whether a failed check refused the file itself, so the draft keeps the refusal with the
 * code. A refusal missing what its message needs, such as the reason the SDK must be chosen,
 * is not one.
 */
export function isFileRefusal(problem: ProblemDetails | undefined): boolean {
  return fileRefusalSchema.safeParse(problem).success;
}

/**
 * The SDK control for the draft's latest check, and the SDK the publisher declared for the
 * code. An inferred or declared SDK can be changed; a detected one can't. The publisher must
 * choose when the api can't tell the SDK, and the dropdown stays while a declared SDK finds
 * no activity or its check has not answered yet.
 */
export function sdkControl(
  check: CheckResult | undefined,
  declaredSdk: SdkName | undefined,
): SdkControl {
  if (check?.outcome === "accepted") {
    return sdkTier(check.facts) === "detected"
      ? { kind: "none" }
      : { kind: "change", sdk: check.facts.sdk };
  }
  const refusal = fileRefusalSchema.safeParse(check?.problem);
  const type = refusal.success ? refusal.data.type : undefined;
  if (type === refusalTypes.sdkChoiceNeeded) {
    return { kind: "choose", chosen: declaredSdk };
  }
  if (declaredSdk === undefined) return { kind: "none" };
  return check === undefined || type === refusalTypes.noActivity
    ? { kind: "choose", chosen: declaredSdk }
    : { kind: "none" };
}

export interface CheckState {
  /** The draft's latest check of the code in the editor. */
  check: CheckResult | undefined;
  /** A check of the code in the editor is running. */
  checking: boolean;
  /**
   * A check of the code in the editor failed without refusing the file. The Problem Details
   * when the API answered, null when it did not, as when the network failed.
   */
  failure: ProblemDetails | null | undefined;
  /** The SDK the publisher chose for the code in the editor, if they chose one. */
  declaredSdk?: SdkName | undefined;
}

/** What the line under the editor says, from the latest check of the code in it. */
export function checkLine({
  check,
  checking,
  failure,
  declaredSdk,
}: CheckState): CheckLine {
  if (checking) return { kind: "checking", text: checkingText };
  if (check?.outcome === "accepted") {
    return { kind: "found", text: foundText(check.facts), facts: check.facts };
  }
  if (check?.outcome === "refused") {
    const refusal = fileRefusalSchema.safeParse(check.problem);
    return refusal.success
      ? { kind: "refused", text: refusalText(refusal.data, declaredSdk) }
      : { kind: "failed", text: failedText };
  }
  if (failure === undefined) return { kind: "none" };
  // These answers carry no type of their own, so their status says what happened.
  if (failure?.status === 429) return { kind: "refused", text: tooManyText };
  if (failure?.status === 413) return { kind: "refused", text: tooLargeText };
  return { kind: "failed", text: failedText };
}
