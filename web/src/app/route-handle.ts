/** What a route module may export as `handle`. The page frame reads it. */
export interface RouteHandle {
  /** Set to false to leave the frame's footer slot empty, as search results will. */
  footer?: boolean;
}

/** Whether the frame shows its footer slot for the matched routes. Any match can opt out. */
export function showsFooter(matches: readonly { handle: unknown }[]): boolean {
  return !matches.some(
    (match) => (match.handle as RouteHandle | undefined)?.footer === false,
  );
}
