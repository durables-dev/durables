import type { Search } from "@/lib/search-address";
import { integrations, sdks } from "@durables/schemas";
import { useId, type ReactNode } from "react";
import styles from "./filter-sidebar.module.css";
import {
  activeFilterCount,
  withAnySdk,
  withIntegrationToggled,
  withoutFilters,
  withSdkToggled,
} from "./search-filters";

export interface FilterSidebarProps {
  /** The search the address holds. */
  search: Search;
  /** Called with the new search as soon as a chip or Clear is clicked. */
  onChange: (search: Search) => void;
}

// The results page's filters: Temporal SDK and Integrates with, as chips that apply at once,
// and "Clear (n)" while any filter is on. The chips come from the shared lists.
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
      <ChipGroup title="Temporal SDK" help="What runtime are you using?">
        <Chip
          label="Any"
          pressed={search.sdks.length === 0}
          onClick={() => {
            onChange(withAnySdk(search));
          }}
        />
        {sdks.map((sdk) => (
          <Chip
            key={sdk}
            label={sdk}
            pressed={search.sdks.includes(sdk)}
            onClick={() => {
              onChange(withSdkToggled(search, sdk));
            }}
          />
        ))}
      </ChipGroup>
      <ChipGroup
        title="Integrates with"
        help="Here is the activity, make it work"
      >
        {integrations.map((integration) => (
          <Chip
            key={integration}
            label={integration}
            pressed={search.integrations.includes(integration)}
            onClick={() => {
              onChange(withIntegrationToggled(search, integration));
            }}
          />
        ))}
      </ChipGroup>
    </aside>
  );
}

interface ChipGroupProps {
  title: string;
  help: string;
  children: ReactNode;
}

function ChipGroup({ title, help, children }: ChipGroupProps) {
  const titleId = useId();
  return (
    <section className={styles["group"]}>
      <p className={styles["caption"]}>
        <span id={titleId} className={styles["title"]}>
          {title}
        </span>{" "}
        <span className={styles["help"]}>{help}</span>
      </p>
      <div role="group" aria-labelledby={titleId} className={styles["chips"]}>
        {children}
      </div>
    </section>
  );
}

interface ChipProps {
  label: string;
  pressed: boolean;
  onClick: () => void;
}

function Chip({ label, pressed, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={styles["chip"]}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
