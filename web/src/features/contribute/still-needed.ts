import { steps, type StepId } from "./steps";

/** The labels of the steps before Review that are not finished, in step order. */
export function stillNeeded(finished: readonly StepId[]): string[] {
  return steps
    .filter(({ id }) => id !== "review" && !finished.includes(id))
    .map(({ label }) => label);
}
