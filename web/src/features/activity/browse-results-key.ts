/**
 * The root of every cached browse result. The search feature keys each search under it
 * (search: browse-query). Features never import from each other, so the key is named here.
 */
export const browseResultsKey = ["activities"] as const;
