import { PageTitle } from "@/components/page-title";
import type { Search } from "@/lib/search-address";
import { FilterSidebar } from "./filter-sidebar";
import { SearchBox } from "./search-box";
import { everything } from "@/lib/search-filters";
import styles from "./search-page.module.css";
import { SearchResults } from "./search-results";

export interface SearchPageProps {
  /** The search the address holds. */
  search: Search;
  /** Called with a changed search, to put it in the address. */
  onSearch: (search: Search) => void;
}

// The results page (screen 3): the search box, the filter sidebar, and the results. Every
// change goes into the address, and the page shows whatever search the address holds.
export function SearchPage({ search, onSearch }: SearchPageProps) {
  return (
    <div className={styles["page"]}>
      <PageTitle
        page="Search"
        description="Search Temporal activities on Durables by what they do, SDK, integration and publisher."
      />
      <h1 className={styles["heading"]}>Search</h1>
      <div className={styles["bar"]}>
        <SearchBox
          words={search.words}
          onSubmit={(words) => {
            onSearch({ ...search, words });
          }}
        />
      </div>
      <div className={styles["body"]}>
        <FilterSidebar search={search} onChange={onSearch} />
        <div className={styles["main"]}>
          <SearchResults
            search={search}
            onClearAll={() => {
              onSearch(everything);
            }}
          />
        </div>
      </div>
    </div>
  );
}
