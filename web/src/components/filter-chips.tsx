import type { Search } from "@/lib/search-address";
import {
  withAnySdk,
  withIntegrationToggled,
  withSdkToggled,
} from "@/lib/search-filters";
import { catalogSdks, sdkCatalogQuery } from "@/lib/sdk-catalog";
import { integrations } from "@durables/schemas";
import { useQuery } from "@tanstack/react-query";
import { useId, type ReactNode } from "react";
import styles from "./filter-chips.module.css";

export interface FilterChipsProps {
  /** The search whose filters the chips show. */
  search: Search;
  /** Called with the new search as soon as a chip is clicked. */
  onChange: (search: Search) => void;
  /** Extra class for each group, for the page's own spacing between them. */
  groupClassName?: string | undefined;
}

// The Temporal SDK and Integrates with chips, shared by the home page's Filters panel and the
// results page's sidebar. The SDK chips come from the SDK catalog, in its order, and the
// integration chips from the shared list. Any is on when no SDK is picked; picking Any clears
// the SDKs. Several SDKs and several integrations can be on. While the catalog loads, or when
// it cannot be read, Any is the only SDK chip.
export function FilterChips({
  search,
  onChange,
  groupClassName,
}: FilterChipsProps) {
  const { data: catalog } = useQuery(sdkCatalogQuery);
  return (
    <>
      <ChipGroup
        title="Temporal SDK"
        help="What runtime are you using?"
        className={groupClassName}
      >
        <Chip
          label="Any"
          pressed={search.sdks.length === 0}
          onClick={() => {
            onChange(withAnySdk(search));
          }}
        />
        {catalogSdks(catalog).map((sdk) => (
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
        className={groupClassName}
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
    </>
  );
}

interface ChipGroupProps {
  title: string;
  help: string;
  className: string | undefined;
  children: ReactNode;
}

function ChipGroup({ title, help, className, children }: ChipGroupProps) {
  const titleId = useId();
  const groupClass =
    className === undefined
      ? styles["group"]
      : `${styles["group"]} ${className}`;
  return (
    <section className={groupClass}>
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
