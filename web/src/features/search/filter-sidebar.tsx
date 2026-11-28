import { FilterChips } from "@/components/filter-chips";
import type { Search } from "@/lib/search-address";
import { activeFilterCount, withoutFilters } from "@/lib/search-filters";
import { useId } from "react";
import styles from "./filter-sidebar.module.css";

export interface FilterSidebarProps {
  /** The search the address holds. */
  search: Search;
  /** Called with the new search as soon as a chip or Clear is clicked. */
  onChange: (search: Search) => void;
}

// The results page's filters: Temporal SDK and the category headings, as chips that apply at
// once, and "Clear (n)" while any filter is on. The chips are the shared chip group.
export function FilterSidebar({ search, onChange }: FilterSidebarProps) {
  const headingId = useId();
  const active = activeFilterCount(search);

  return (
    <aside className={styles["sidebar"]} aria-labelledby={headingId}>
      <div className={styles["header"]}>
        <h2 id={headingId} className={styles["heading"]}>
          Filters
        </h2>
        {active === 0 ? null : (
          <button
            type="button"
            className={styles["clear"]}
            onClick={() => {
              onChange(withoutFilters(search));
            }}
          >
            Clear ({active})
          </button>
        )}
      </div>
      <FilterChips
        search={search}
        onChange={onChange}
        groupClassName={styles["group"]}
      />
    </aside>
  );
}
