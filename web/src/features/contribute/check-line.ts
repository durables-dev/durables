import type { ProblemDetails } from "@/lib/problem";
import { z } from "zod";
import type { CheckedFacts, CheckResult } from "./check-result";

// What the line under the paste editor says about the latest check. Refusals are told apart
// by their Problem Details type, never by their title or detail (web/CONVENTIONS.md, Data).
// The types are the API's (api: checks/refusals.ts).

/** The Problem Details type of each refusal the check answers. */
export const refusalTypes = {
  noActivity: "https://durables.dev/problems/no-activity",
  notTemporalActivity: "https://durables.dev/problems/not-a-temporal-activity",
  unacceptedSdk: "https://durables.dev/problems/unaccepted-sdk",
  multipleActivities: "https://durables.dev/problems/multiple-activities",
  codeTooLarge: "https://durables.dev/problems/code-too-large",
} as const;

/** A refusal is about the file, so the draft keeps it with the code. */
const fileRefusalSchema = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal(refusalTypes.noActivity) }),
  z.looseObject({ type: z.literal(refusalTypes.notTemporalActivity) }),
  z.looseObject({
    type: z.literal(refusalTypes.unacceptedSdk),
    sdk: z.enum(["Java", "Go", "PHP"]),
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

export const checkingText = "Checking…";

/** Said when the check could not run, as when the network fails or the API answers 500. */
export const failedText =
  "The check couldn't run. Paste the file again to retry.";

const tooLargeText = "This file is too large to check. The limit is 100 KB.";

const tooManyText =
  "Too many checks in a short time. Wait a minute and try again.";

/** The Found line for an accepted file. */
export function foundText(facts: CheckedFacts): string {
  return `✓ Found ${facts.activity.name} (${facts.sdk}). Next, check what we detected.`;
}

function refusalText(refusal: FileRefusal): string {
  switch (refusal.type) {
    case refusalTypes.noActivity:
      return "Found the SDK but no activity function with typed input and output.";
    case refusalTypes.notTemporalActivity:
      return "This doesn't look like a Python, TypeScript or .NET Temporal activity.";
    case refusalTypes.unacceptedSdk:
      return `Durables accepts Python, TypeScript and .NET activities. This file looks like a ${refusal.sdk} activity.`;
    case refusalTypes.multipleActivities:
      return `This file has ${String(refusal.count)} activities. Durables publishes one activity per file. Paste a file with only the one you want to share.`;
    case refusalTypes.codeTooLarge:
      return tooLargeText;
  }
}

/**
 * Whether a failed check refused the file itself, so the draft keeps the refusal with the
 * code. A refusal missing what its message needs, such as the SDK it names, is not one.
 */
export function isFileRefusal(problem: ProblemDetails | undefined): boolean {
  return fileRefusalSchema.safeParse(problem).success;
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
}

/** What the line under the editor says, from the latest check of the code in it. */
export function checkLine({ check, checking, failure }: CheckState): CheckLine {
  if (checking) return { kind: "checking", text: checkingText };
  if (check?.outcome === "accepted") {
    return { kind: "found", text: foundText(check.facts), facts: check.facts };
  }
  if (check?.outcome === "refused") {
    const refusal = fileRefusalSchema.safeParse(check.problem);
    return refusal.success
      ? { kind: "refused", text: refusalText(refusal.data) }
      : { kind: "failed", text: failedText };
  }
  if (failure === undefined) return { kind: "none" };
  // These answers carry no type of their own, so their status says what happened.
  if (failure?.status === 429) return { kind: "refused", text: tooManyText };
  if (failure?.status === 413) return { kind: "refused", text: tooLargeText };
  return { kind: "failed", text: failedText };
}
