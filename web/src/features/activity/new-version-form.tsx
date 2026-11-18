import {
  newVersionEntryPath,
  newVersionEntryState,
} from "@/lib/new-version-entry";
import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { ListingAddress } from "./listing-address";
import styles from "./new-version-form.module.css";
import { versionRows, type ListingVersion } from "./version-rows";

export interface NewVersionFormProps {
  /** The version being viewed, which the choice starts on. */
  address: ListingAddress;
  /** Every version of the listing, newest first. */
  versions: readonly ListingVersion[];
  /** Closes the dialog without starting. */
  onCancel: () => void;
}

// The body of the Create a new version dialog: one radio per version, newest first, with
// "· latest" on the latest and each version's note. The choice starts on the version being
// viewed. Start from {version} opens Contribute in new-version mode, based on the version
// chosen, and remembers this page for Back.
export function NewVersionForm({
  address,
  versions,
  onCancel,
}: NewVersionFormProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const rows = versionRows(versions, address.version);
  const latest = rows[0]?.version ?? address.version;
  const [chosen, setChosen] = useState(address.version);
  const idPrefix = useId();

  return (
    <form
      className={styles["form"]}
      onSubmit={(event) => {
        event.preventDefault();
        void navigate(newVersionEntryPath, {
          state: newVersionEntryState(
            { handle: address.handle, name: address.name, basedOn: chosen },
            location,
          ),
        });
      }}
    >
      <fieldset className={styles["choices"]}>
        <legend className={styles["hidden"]}>Version to start from</legend>
        {rows.map((row) => (
          <div key={row.version} className={styles["choice"]}>
            <input
              id={`${idPrefix}-${row.version}`}
              type="radio"
              name="basedOn"
              value={row.version}
              checked={chosen === row.version}
              onChange={() => {
                setChosen(row.version);
              }}
              className={styles["radio"]}
            />
            <label
              htmlFor={`${idPrefix}-${row.version}`}
              className={styles["text"]}
            >
              <span className={styles["version"]}>
                {row.version}
                {row.latest ? " · latest" : ""}
              </span>
              <span className={styles["note"]}>{row.note}</span>
            </label>
          </div>
        ))}
      </fieldset>
      <p className={styles["rule"]}>
        The new version number must be higher than {latest}, the latest.
      </p>
      <div className={styles["actions"]}>
        <button type="button" className={styles["cancel"]} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles["start"]}>
          Start from {chosen}
        </button>
      </div>
    </form>
  );
}
