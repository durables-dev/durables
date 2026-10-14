import type { z } from "zod";
import { type FieldError, ProblemError } from "./problem";

type ValidationResult =
  | { success: true }
  | { success: false; error: { issues: readonly z.core.$ZodIssue[] } };

/** One entry per failing field, keeping the first message for each. */
export const fieldErrors = (
  issues: readonly z.core.$ZodIssue[],
): FieldError[] => {
  const byField = new Map<string, string>();
  for (const issue of issues) {
    const field = issue.path.map(String).join(".");
    if (!byField.has(field)) {
      byField.set(field, issue.message);
    }
  }
  return [...byField].map(([field, message]) => ({ field, message }));
};

/**
 * The validation hook. Pass it as zValidator's third argument so a failure answers 400
 * Problem Details with an errors list: zValidator("query", schema, problemOnInvalid).
 */
export const problemOnInvalid = (result: ValidationResult): void => {
  if (!result.success) {
    throw new ProblemError({
      status: 400,
      detail: "The request is not valid.",
      errors: fieldErrors(result.error.issues),
    });
  }
};
