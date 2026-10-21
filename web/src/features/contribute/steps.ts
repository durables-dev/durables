import { z } from "zod";

/** The steps of the Contribute flow, in order. README is not a step in the MVP. */
export const steps = [
  { id: "profile", label: "Profile & Handle" },
  { id: "code", label: "Code" },
  { id: "detected", label: "Detected" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
] as const;

export type StepId = (typeof steps)[number]["id"];

export const stepIdSchema = z.enum([
  "profile",
  "code",
  "detected",
  "details",
  "review",
]);

/** The address of a step in the Contribute flow. */
export function stepPath(step: StepId): string {
  return `/contribute/${step}`;
}

/** The first step that is not finished. The last step when every step is finished. */
export function earliestUnfinished(finished: readonly StepId[]): StepId {
  const step =
    steps.find(({ id }) => !finished.includes(id)) ?? steps[steps.length - 1];
  return step?.id ?? "profile";
}

/** A step is locked until every step before it is finished. */
export function isLocked(step: StepId, finished: readonly StepId[]): boolean {
  const index = steps.findIndex(({ id }) => id === step);
  return steps.slice(0, index).some(({ id }) => !finished.includes(id));
}

/**
 * The step to show for the step named in the address. A missing, unknown or locked step
 * falls back to the earliest unfinished step.
 */
export function resolveStep(
  param: string | undefined,
  finished: readonly StepId[],
): StepId {
  const parsed = stepIdSchema.safeParse(param);
  if (!parsed.success || isLocked(parsed.data, finished)) {
    return earliestUnfinished(finished);
  }
  return parsed.data;
}

/**
 * The finished steps. A publisher whose provider account already has a Durables account has
 * finished Profile & Handle, whatever the draft holds, so they go straight to Code.
 */
export function finishedSteps(
  draftFinished: readonly StepId[],
  accountExists: boolean,
): readonly StepId[] {
  return accountExists && !draftFinished.includes("profile")
    ? ["profile", ...draftFinished]
    : draftFinished;
}
