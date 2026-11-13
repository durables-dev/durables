import type { SdkName } from "./sdk-catalog";
import type { Search } from "./search-address";
import type { Integration } from "@durables/schemas";

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

/** The search with one integration picked or, when it is already picked, unpicked. */
export function withIntegrationToggled(
  search: Search,
  integration: Integration,
): Search {
  return {
    ...search,
    integrations: search.integrations.includes(integration)
      ? search.integrations.filter((picked) => picked !== integration)
      : [...search.integrations, integration],
  };
}

/** How many filters are on: each SDK, each integration, and a publisher. Words do not count. */
export function activeFilterCount(search: Search): number {
  return (
    search.sdks.length +
    search.integrations.length +
    (search.publisher === undefined ? 0 : 1)
  );
}

/** The search with every filter cleared and the words kept. */
export function withoutFilters(search: Search): Search {
  return { words: search.words, sdks: [], integrations: [] };
}

/** No words and no filters: every activity. */
export const everything: Search = { words: "", sdks: [], integrations: [] };
