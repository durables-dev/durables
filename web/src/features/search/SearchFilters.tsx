import type { ActivitySearchFilters, SearchSdk } from "../../api/types";
import { SDK_NAMES } from "../../lib/sdks";
import styles from "./SearchFilters.module.css";

const SDK_CHOICES: SearchSdk[] = ["python", "typescript", "dotnet"];

/** The SDK choice and the two behavior checkboxes. Each change is handed straight back. */
export function SearchFilters({
  filters,
  onChange,
}: {
  filters: ActivitySearchFilters;
  onChange: (filters: ActivitySearchFilters) => void;
}) {
  // An undefined value unsets that filter.
  const set = (patch: ActivitySearchFilters) => onChange({ ...filters, ...patch });

  return (
    <div className={styles.filters}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>SDK</legend>
        <label className={styles.option}>
          <input type="radio" name="sdk" checked={!filters.sdk} onChange={() => set({ sdk: undefined })} />
          Any
        </label>
        {SDK_CHOICES.map((sdk) => (
          <label key={sdk} className={styles.option}>
            <input type="radio" name="sdk" checked={filters.sdk === sdk} onChange={() => set({ sdk })} />
            {SDK_NAMES[sdk]}
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Temporal behavior</legend>
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={filters.idempotent === true}
            onChange={(event) => set({ idempotent: event.target.checked || undefined })}
          />
          Idempotent
        </label>
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={filters.hasCompensation === true}
            onChange={(event) => set({ hasCompensation: event.target.checked || undefined })}
          />
          Has compensation
        </label>
      </fieldset>
    </div>
  );
}
