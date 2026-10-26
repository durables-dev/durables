import { problemFrom } from "./problem";

/** How many times a failed query is tried again, as TanStack Query does by default. */
const maxRetries = 3;

/**
 * Whether a failed query is tried again. A 404 is an answer: the thing asked for does not
 * exist, and asking again will not change that, so it is shown at once.
 */
export function retryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < maxRetries && problemFrom(error)?.status !== 404;
}
