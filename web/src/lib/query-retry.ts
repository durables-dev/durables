import { problemFrom } from "./problem";

/** How many times a failed query is tried again, as TanStack Query does by default. */
const maxRetries = 3;

/** Statuses that are answers. Asking again will not change them, so they are shown at once. */
const answers = new Set([
  // Not signed in, such as on the profile. Asking again will not sign the visitor in.
  401,
  // The thing asked for does not exist.
  404,
]);

/** Whether a failed query is tried again. A 401 or a 404 is an answer and never is. */
export function retryQuery(failureCount: number, error: unknown): boolean {
  const status = problemFrom(error)?.status;
  return (
    failureCount < maxRetries && (status === undefined || !answers.has(status))
  );
}
