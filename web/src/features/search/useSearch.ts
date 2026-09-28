import { useEffect, useState } from "react";
import { searchActivities } from "../../api/search";
import type { ActivitySearchFilters, ActivitySummary } from "../../api/types";

export type SearchState = { results: ActivitySummary[] | null; error: string | null };

/** Re-queries api whenever a filter changes. web does no filtering of its own. */
export function useSearch(filters: ActivitySearchFilters): SearchState {
  const [state, setState] = useState<SearchState>({ results: null, error: null });
  const { sdk, idempotent, hasCompensation } = filters;

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ results: previous.results, error: null }));
    searchActivities({
      ...(sdk ? { sdk } : {}),
      ...(idempotent ? { idempotent } : {}),
      ...(hasCompensation ? { hasCompensation } : {}),
    })
      .then((response) => !cancelled && setState({ results: response.results, error: null }))
      .catch((caught) => !cancelled && setState({ results: null, error: caught instanceof Error ? caught.message : String(caught) }));
    return () => {
      cancelled = true;
    };
  }, [sdk, idempotent, hasCompensation]);

  return state;
}
