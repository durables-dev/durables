import { fieldMessage, problemFrom } from "@/lib/problem";

// Why saving the description did not go through, and what the Update dialog shows. Refusals
// are told apart by their status, never by their title or detail (web/CONVENTIONS.md, Data).

/** Shown above the buttons for a refusal with no answer of its own, or a network failure. */
export const saveFailedMessage = "Your description wasn't saved. Try again.";

/** What the Update dialog does after a save was refused. The typed text is kept either way. */
export type SaveRefusal =
  /** The sign-in has ended (401): the sign-in-ended message and a link to sign in again. */
  | { kind: "signInEnded" }
  /** The API refused the description itself (400): its message shows under the field. */
  | { kind: "rejected"; message: string }
  /** Anything else, including 403, 404, a server error and a network failure. */
  | { kind: "failed" };

/** What a failed save means for the dialog. */
export function saveRefusal(error: unknown): SaveRefusal {
  const problem = problemFrom(error);
  if (problem === undefined) return { kind: "failed" };
  if (problem.status === 401) return { kind: "signInEnded" };
  if (problem.status === 400) {
    const message = fieldMessage(problem, "description");
    if (message !== undefined) return { kind: "rejected", message };
  }
  return { kind: "failed" };
}
