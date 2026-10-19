import { z } from "zod";

/**
 * A page on this site the Contribute flow can send the publisher back to: a path with one
 * leading slash, outside the flow itself. Anything else, including another origin, is refused.
 */
export const contributeOriginSchema = z
  .string()
  .regex(/^\/(?![/\\])/)
  .refine((path) => !/^\/contribute(?:[/?#]|$)/.test(path));

/** The router state a link into the Contribute flow carries: the page it was followed from. */
export interface ContributeEntryState {
  from: string;
}

/** The state for a link into the Contribute flow, naming the page the link sits on. */
export function contributeEntryState(location: {
  pathname: string;
  search: string;
}): ContributeEntryState {
  return { from: `${location.pathname}${location.search}` };
}

const entryStateSchema = z.object({ from: contributeOriginSchema });

/** The page the flow was opened from, or undefined when the router state does not name one. */
export function originFromEntryState(state: unknown): string | undefined {
  const parsed = entryStateSchema.safeParse(state);
  return parsed.success ? parsed.data.from : undefined;
}
