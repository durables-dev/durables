import { problemFrom } from "@/lib/problem";

// Why a deprecation, an undo, a removal or a return to search did not go through, and what
// the page shows. Refusals are told apart by their status and the field the API names, never
// by their title or detail (web/CONVENTIONS.md, Data).

/** Shown for a refusal with no answer of its own, or a network failure. */
export const changeFailedMessage = "That didn't save. Try again.";

/** What the page does after a change was refused. Nothing on the page changes either way. */
export type ChangeRefusal =
  /** The sign-in has ended (401): the sign-in-ended message and a link to sign in again. */
  | { kind: "signInEnded" }
  /** The API refused one of the dialog's fields (400 or 422): its message shows under it. */
  | { kind: "rejected"; field: string; message: string }
  /** Anything else, including 403, 404, 409, a server error and a network failure. */
  | { kind: "failed" };

/** What a refused change means, given the fields the dialog shows. */
export function changeRefusal(
  error: unknown,
  fields: readonly string[] = [],
): ChangeRefusal {
  const problem = problemFrom(error);
  if (problem === undefined) return { kind: "failed" };
  if (problem.status === 401) return { kind: "signInEnded" };
  if (problem.status === 400 || problem.status === 422) {
    const named = problem.errors?.find(({ field }) => fields.includes(field));
    if (named !== undefined) {
      return { kind: "rejected", field: named.field, message: named.message };
    }
  }
  return { kind: "failed" };
}
