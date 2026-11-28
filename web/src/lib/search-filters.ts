import type { SdkName } from "./sdk-catalog";
import type { Search } from "./search-address";
import type { CategoryName, Chip } from "@durables/schemas";

/** The search with every SDK cleared, which is what the Any chip means. */
export function withAnySdk(search: Search): Search {
  return { ...search, sdks: [] };
}

/**
 * The search with one SDK picked or, when it is already picked, unpicked. Picking an SDK
 * turns Any off. Unpicking the last one leaves no SDKs, which is Any again.
 */
export function withSdkToggled(search: Search, sdk: SdkName): Search {
  return {
    ...search,
    sdks: search.sdks.includes(sdk)
      ? search.sdks.filter((picked) => picked !== sdk)
      : [...search.sdks, sdk],
  };
}

/**
 * The search with one chip picked or, when it is already picked, unpicked. A category stays
 * as it is, so it applies again once the last chip goes off.
 */
export function withChipToggled(search: Search, chip: Chip): Search {
  return {
    ...search,
    chips: search.chips.includes(chip)
      ? search.chips.filter((picked) => picked !== chip)
      : [...search.chips, chip],
  };
}

/**
 * The category that applies to the results: the address's category while no chip is on.
 * Undefined when there is no category or a chip is on. An SDK, words or a publisher do not stop
 * it applying.
 */
export function appliedCategory(search: Search): CategoryName | undefined {
  return search.chips.length === 0 ? search.category : undefined;
}

/** The search with the category removed. The words, SDKs, chips and publisher are kept. */
export function withoutCategory(search: Search): Search {
  const { words, sdks, chips, publisher } = search;
  return publisher === undefined
    ? { words, sdks, chips }
    : { words, sdks, chips, publisher };
}

/**
 * How many filters are on: each SDK, each chip, the category and the publisher. The category
 * counts whenever the search holds one, even while a chip stops it applying. Words do not
 * count.
 */
export function activeFilterCount(search: Search): number {
  return (
    search.sdks.length +
    search.chips.length +
    (search.category === undefined ? 0 : 1) +
    (search.publisher === undefined ? 0 : 1)
  );
}

/** The search with every SDK and chip, the category and the publisher cleared, and the words kept. */
export function withoutFilters(search: Search): Search {
  return { words: search.words, sdks: [], chips: [] };
}

/** No words and no filters: every activity. */
export const everything: Search = { words: "", sdks: [], chips: [] };
