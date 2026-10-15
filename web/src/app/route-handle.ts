/** What a route module may export as `handle`. The page frame reads it. */
export interface RouteHandle {
  /** Set to false to leave the frame's footer slot empty, as search results will. */
  footer?: boolean;
  /** Set to false to leave the Contribute button out of the header, as the Contribute flow does. */
  contribute?: boolean;
}

function optsOut(
  matches: readonly { handle: unknown }[],
  key: keyof RouteHandle,
): boolean {
  return matches.some(
    (match) => (match.handle as RouteHandle | undefined)?.[key] === false,
  );
}

/** Whether the frame shows its footer slot for the matched routes. Any match can opt out. */
export function showsFooter(matches: readonly { handle: unknown }[]): boolean {
  return !optsOut(matches, "footer");
}

/** Whether the header shows the Contribute button for the matched routes. Any match can opt out. */
export function showsContribute(
  matches: readonly { handle: unknown }[],
): boolean {
  return !optsOut(matches, "contribute");
}
