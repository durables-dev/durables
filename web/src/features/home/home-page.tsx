import { FilterChips } from "@/components/filter-chips";
import { PageTitle } from "@/components/page-title";
import { SearchField } from "@/components/search-field";
import { searchAddress, type Search } from "@/lib/search-address";
import { activeFilterCount, everything } from "@/lib/search-filters";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { BasicsLinks } from "./basics-links";
import { CategoryTiles } from "./category-tiles";
import styles from "./home-page.module.css";

// The home page (screens 1 and 2): the headline, the two short explanations, the search box with its Filters panel, the
// Search button, the category tiles, and Explore All. Search opens the results with the words
// typed and the chips picked. A tile opens its category. Explore All opens every activity.
export function HomePage() {
  const navigate = useNavigate();
  const panelId = useId();
  const [filters, setFilters] = useState<Search>(everything);
  const [panelOpen, setPanelOpen] = useState(false);
  const active = activeFilterCount(filters);

  // Enter in the box and the Search button both submit the form.
  function submit(form: FormData) {
    const typed = form.get("q");
    const words = typeof typed === "string" ? typed : "";
    void navigate(searchAddress({ ...filters, words }));
  }

  return (
    <div className={styles["hero"]}>
      <PageTitle />
      <h1 className={styles["headline"]}>Temporal activities, ready to use.</h1>
      <BasicsLinks />
      <form role="search" action={submit} className={styles["form"]}>
        <SearchField className={styles["box"]}>
          <button
            type="button"
            className={styles["filters"]}
            aria-expanded={panelOpen}
            aria-controls={panelOpen ? panelId : undefined}
            onClick={() => {
              setPanelOpen(!panelOpen);
            }}
          >
            <svg
              className={styles["filtersIcon"]}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="10" cy="12" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
            Filters
            {active === 0 ? null : (
              <>
                <span className={styles["count"]} aria-hidden="true">
                  {active}
                </span>
                <span className={styles["hidden"]}>({active} on)</span>
              </>
            )}
          </button>
        </SearchField>
        {panelOpen ? (
          <div id={panelId} className={styles["panel"]}>
            <FilterChips search={filters} onChange={setFilters} />
            {active === 0 ? null : (
              <div className={styles["clearRow"]}>
                <button
                  type="button"
                  className={styles["clear"]}
                  onClick={() => {
                    setFilters(everything);
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        ) : null}
        <div className={styles["actions"]}>
          <button type="submit" className={styles["submit"]}>
            Search
          </button>
        </div>
      </form>
      <div className={styles["browse"]}>
        <CategoryTiles />
        <div className={styles["exploreRow"]}>
          <Link to={searchAddress()} className={styles["explore"]}>
            Explore All
          </Link>
        </div>
      </div>
    </div>
  );
}
