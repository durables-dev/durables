import { FilterChips } from "@/components/filter-chips";
import { PageTitle } from "@/components/page-title";
import { searchAddress, type Search } from "@/lib/search-address";
import { activeFilterCount, everything } from "@/lib/search-filters";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import styles from "./home-page.module.css";

// The home page (screens 1 and 2): the headline, the search box with its Filters panel, the
// Search button, and Explore All. Search opens the results with the words typed and the chips
// picked. Explore All opens every activity.
export function HomePage() {
  const navigate = useNavigate();
  const inputId = useId();
  const panelId = useId();
  const [filters, setFilters] = useState<Search>(everything);
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(filters);

  // Enter in the box and the Search button both submit the form.
  function search(form: FormData) {
    const typed = form.get("q");
    const words = typeof typed === "string" ? typed : "";
    void navigate(searchAddress({ ...filters, words }));
  }

  return (
    <div className={styles["hero"]}>
      <PageTitle />
      <h1 className={styles["headline"]}>
        Temporal activities, ready to copy.
      </h1>
      <form role="search" action={search} className={styles["form"]}>
        <div className={styles["box"]}>
          <svg
            className={styles["icon"]}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <label htmlFor={inputId} className={styles["hidden"]}>
            Search activities
          </label>
          <input
            id={inputId}
            name="q"
            type="search"
            className={styles["input"]}
            placeholder="Describe what you need, or just use Filters"
            autoComplete="off"
          />
          <button
            type="button"
            className={styles["filters"]}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => {
              setOpen(!open);
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
        </div>
        {open ? (
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
          <Link to={searchAddress()} className={styles["explore"]}>
            Explore All
          </Link>
          <button type="submit" className={styles["submit"]}>
            Search
          </button>
        </div>
      </form>
    </div>
  );
}
