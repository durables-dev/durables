import type { Search } from "@/lib/search-address";
import {
  withAnySdk,
  withChipToggled,
  withSdkToggled,
} from "@/lib/search-filters";
import { catalogSdks, sdkCatalogQuery } from "@/lib/sdk-catalog";
import { categories } from "@durables/schemas";
import { useQuery } from "@tanstack/react-query";
import { useId, type ReactNode } from "react";
import styles from "./filter-chips.module.css";

export interface FilterChipsProps {
  /** The search whose filters the chips show. */
  search: Search;
  /** Called with the new search as soon as a chip is clicked. */
  onChange: (search: Search) => void;
  /**
   * Extra class for the Temporal SDK group and for the block of category headings, for the
   * page's own spacing between them.
   */
  groupClassName?: string | undefined;
}

// The Temporal SDK chips, then one heading per category with its chips, shared by the home
// page's Filters panel and the results page's sidebar. The SDK chips come from the SDK
// catalog, in its order. The categories, their help lines and their chips come from the shared
// list, in its order. Any is on when no SDK is picked; picking Any clears the SDKs. Each chip
// turns on and off alone, and several can be on, under one heading or several. A heading is
// not a chip, and there is no All chip. While the catalog loads, or when it cannot be read,
// Any is the only SDK chip.
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
      <div className={withClass(styles["categories"], groupClassName)}>
        {categories.map((category) => (
          <ChipGroup
            key={category.name}
            title={category.name}
            help={category.help}
            className={undefined}
          >
            {category.chips.map((chip) => (
              <Chip
                key={chip}
                label={chip}
                pressed={search.chips.includes(chip)}
                onClick={() => {
                  onChange(withChipToggled(search, chip));
                }}
              />
            ))}
          </ChipGroup>
        ))}
      </div>
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
  const helpId = useId();
  return (
    <section className={withClass(styles["group"], className)}>
      <p className={styles["caption"]}>
        <span id={titleId} className={styles["title"]}>
          {title}
        </span>{" "}
        <span id={helpId} className={styles["help"]}>
          {help}
        </span>
      </p>
      <div
        role="group"
        aria-labelledby={titleId}
        aria-describedby={helpId}
        className={styles["chips"]}
      >
        {children}
      </div>
    </section>
  );
}

/** `base`, with `extra` after it when there is one. */
function withClass(base: string | undefined, extra: string | undefined) {
  return extra === undefined ? base : `${base ?? ""} ${extra}`;
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
