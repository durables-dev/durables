import {
  sdkCatalogQuery,
  type SdkCatalog,
  type SdkName,
} from "@/lib/sdk-catalog";
import { useQuery } from "@tanstack/react-query";
import { useId, useState, type ChangeEvent } from "react";
import { foundParts, type CheckLine, type SdkControl } from "./check-line";
import styles from "./check-line-row.module.css";
import type { CheckedFacts } from "./check-result";
import { PublishedCode } from "./published-code";

export interface CheckLineRowProps {
  line: CheckLine;
  /** Whether the SDK can be changed, or must be chosen. */
  control: SdkControl;
  /** The code in the editor, which "View what will be published" shows. */
  code: string;
  /** Checks the code again with the SDK the publisher chose. */
  onDeclare: (sdk: SdkName) => void;
}

/** Moves focus to an SDK control as it appears. */
function focusElement(element: HTMLElement | null) {
  element?.focus();
}

/**
 * Moves focus to an SDK control as it appears, when focus was lost because the control the
 * publisher used went away. Focus anywhere else is left where it is.
 */
function restoreFocus(element: HTMLElement | null) {
  const active = document.activeElement;
  if (element !== null && (active === null || active === document.body)) {
    element.focus();
  }
}

/** The SDK the publisher picked, read from the catalog. Nothing for "Choose an SDK". */
function picked(
  event: ChangeEvent<HTMLSelectElement>,
  catalog: SdkCatalog | undefined,
): SdkName | undefined {
  const { value } = event.currentTarget;
  return catalog?.find(({ name }) => name === value)?.name;
}

/**
 * The dropdown's SDKs: every SDK in the catalog. While the catalog loads, only the SDK already
 * shown, so nothing is made up.
 */
function sdkOptions(
  catalog: SdkCatalog | undefined,
  current: string | undefined,
): string[] {
  if (catalog !== undefined) return catalog.map(({ name }) => name);
  return current === undefined ? [] : [current];
}

// The row under the paste editor: what the latest check found, or why it refused the file.
// The message sits in a status region that is always in the markup, so each new result is
// announced. An accepted file shows the Found line, with "View what will be published" at
// the right of the row to open the code in a read-only dialog. A refusal shows in a
// Gold-tint panel.
//
// An inferred or declared SDK's name on the Found line is a link labelled "Change the SDK",
// followed by the SDK, such as "Change the SDK, Go".
// Pressing it turns it into a dropdown of every SDK in the catalog, and choosing one checks
// the code again with that SDK. When the api can't tell the SDK, a dropdown labelled "SDK"
// sits under the message until a check with the chosen SDK finds the activity. The dropdowns
// are disabled while the catalog loads.
export function CheckLineRow({
  line,
  control,
  code,
  onDeclare,
}: CheckLineRowProps) {
  const { data: catalog } = useQuery(sdkCatalogQuery);
  // The Found line whose SDK link was pressed. A new check result closes the dropdown.
  const [changing, setChanging] = useState<CheckedFacts | undefined>();
  const changeId = useId();
  const chooseId = useId();

  function declare(event: ChangeEvent<HTMLSelectElement>) {
    const sdk = picked(event, catalog);
    if (sdk !== undefined) onDeclare(sdk);
  }

  function sdkName(facts: CheckedFacts) {
    if (control.kind !== "change") return facts.sdk;
    if (changing !== facts) {
      return (
        <button
          ref={restoreFocus}
          type="button"
          aria-label={`Change the SDK, ${facts.sdk}`}
          className={styles["sdkLink"]}
          onClick={() => {
            setChanging(facts);
          }}
        >
          {facts.sdk}
        </button>
      );
    }
    return (
      <>
        <label htmlFor={changeId} className={styles["hidden"]}>
          SDK
        </label>
        <select
          ref={focusElement}
          id={changeId}
          className={styles["select"]}
          value={facts.sdk}
          disabled={catalog === undefined}
          onChange={declare}
          onKeyDown={(event) => {
            if (event.key === "Escape") setChanging(undefined);
          }}
        >
          {sdkOptions(catalog, facts.sdk).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </>
    );
  }

  function found(facts: CheckedFacts) {
    const [before, , after] = foundParts(facts);
    return (
      <p className={styles["found"]}>
        {before}
        {sdkName(facts)}
        {after}
      </p>
    );
  }

  return (
    <div className={styles["row"]}>
      <div role="status" className={styles["status"]}>
        {line.kind === "checking" ? (
          <p className={styles["checking"]}>{line.text}</p>
        ) : null}
        {line.kind === "found" ? found(line.facts) : null}
        {line.kind === "refused" ? (
          <p className={styles["refused"]}>{line.text}</p>
        ) : null}
        {line.kind === "failed" ? (
          <p className={styles["failed"]}>{line.text}</p>
        ) : null}
      </div>
      {line.kind === "found" ? (
        <PublishedCode code={code} sdk={line.facts.sdk} />
      ) : null}
      {control.kind === "choose" ? (
        <div className={styles["choose"]}>
          <label htmlFor={chooseId} className={styles["label"]}>
            SDK
          </label>
          <select
            ref={restoreFocus}
            id={chooseId}
            className={styles["select"]}
            value={control.chosen ?? ""}
            disabled={catalog === undefined}
            onChange={declare}
          >
            <option value="">Choose an SDK</option>
            {sdkOptions(catalog, control.chosen).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
