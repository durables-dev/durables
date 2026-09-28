import { Panel } from "../components/Panel";
import { SearchFilters } from "../features/search/SearchFilters";
import { SearchResults } from "../features/search/SearchResults";
import { useSearch } from "../features/search/useSearch";
import { useSearchFilters } from "../features/search/useSearchFilters";

/** Step 8: filter the catalog by SDK and Temporal behavior at /search. A public read; no user is needed. */
export function SearchPage() {
  const [filters, setFilters] = useSearchFilters();
  const { results, error } = useSearch(filters);

  return (
    <>
      <h1>Search activities</h1>
      <Panel title="Filters">
        <SearchFilters filters={filters} onChange={setFilters} />
      </Panel>
      <Panel title="Results">
        {error ? <p>{error}</p> : results ? <SearchResults results={results} /> : <p>Loading…</p>}
      </Panel>
    </>
  );
}
