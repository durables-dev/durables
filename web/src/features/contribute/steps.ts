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

/** One step as the step list shows it. */
export type Step = (typeof steps)[number];

/**
 * Which flow the publisher is in: a first publish, or a new version of an existing listing.
 * A new version has no Sign in or Handle step: its publisher already has an account.
 */
export type Flow = "first" | "newVersion";

const newVersionSteps: readonly Step[] = steps.filter(
  ({ id }) => id !== "profile",
);

/** The steps of a flow, in order. */
export function flowSteps(flow: Flow): readonly Step[] {
  return flow === "newVersion" ? newVersionSteps : steps;
}

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
export function earliestUnfinished(
  finished: readonly StepId[],
  flow: Flow = "first",
): StepId {
  const ordered = flowSteps(flow);
  const step =
    ordered.find(({ id }) => !finished.includes(id)) ??
    ordered[ordered.length - 1];
  return step?.id ?? "profile";
}

/**
 * A step is locked until every step before it is finished. A step that is not in the flow is
 * always locked.
 */
export function isLocked(
  step: StepId,
  finished: readonly StepId[],
  flow: Flow = "first",
): boolean {
  const ordered = flowSteps(flow);
  const index = ordered.findIndex(({ id }) => id === step);
  if (index === -1) return true;
  return ordered.slice(0, index).some(({ id }) => !finished.includes(id));
}

/**
 * The step to show for the step named in the address. A missing, unknown or locked step
 * falls back to the earliest unfinished step.
 */
export function resolveStep(
  param: string | undefined,
  finished: readonly StepId[],
  flow: Flow = "first",
): StepId {
  const parsed = stepIdSchema.safeParse(param);
  if (!parsed.success || isLocked(parsed.data, finished, flow)) {
    return earliestUnfinished(finished, flow);
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
