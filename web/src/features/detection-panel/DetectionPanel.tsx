import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Detection, Located } from "../../api/types";
import { CodeView } from "../../components/code/CodeView";
import { LineLink } from "../../components/LineLink";
import { SDK_NAMES } from "../../lib/sdks";
import styles from "./DetectionPanel.module.css";

type DetectionPanelProps = {
  detection: Detection;
  /**
   * The code detection ran on, and its Monaco language. When given, each fact
   * gets an evidence link to its line, which opens the code with that line
   * highlighted.
   */
  evidence?: { code: string; language: string };
  /** Stack each fact under its label, to fit a sidebar. */
  compact?: boolean;
};

type Evidence = { fact: string; line: number };

/**
 * What regex detection found: step 1's visible result on the publish page, and
 * the Detected panel on every listing.
 */
export function DetectionPanel({ detection, evidence, compact = false }: DetectionPanelProps) {
  const [shown, setShown] = useState<Evidence | null>(null);
  const withLine = (fact: string, line: number): ReactNode =>
    evidence && (
      <span className={styles.line}>
        <LineLink line={line} onClick={() => setShown({ fact, line })} />
      </span>
    );
  const item = (fact: string, located: Located<string>, label = located.value) => (
    <span key={`${label}-${located.line}`} className={styles.fact}>
      <code className={styles.item}>{label}</code>
      {withLine(fact, located.line)}
    </span>
  );

  return (
    <>
      <dl className={compact ? `${styles.facts} ${styles.compact}` : styles.facts}>
        <dt>SDK</dt>
        <dd>
          <span className={styles.fact}>
            {SDK_NAMES[detection.sdk.value]}
            {withLine("SDK", detection.sdk.line)}
          </span>
        </dd>

        <dt>Activity name</dt>
        <dd>{item("Activity name", detection.activityName)}</dd>

        <dt>Input types</dt>
        <dd>
          {detection.inputTypes.length === 0
            ? "None"
            : detection.inputTypes.map((input) =>
                item("Input types", { value: input.name, line: input.line }, `${input.name}: ${input.type}`),
              )}
        </dd>

        <dt>Output type</dt>
        <dd>{item("Output type", detection.outputType)}</dd>

        <dt>Non-retryable errors</dt>
        <dd>
          {detection.nonRetryableErrorTypes.length === 0
            ? "None found"
            : detection.nonRetryableErrorTypes.map((error) => item("Non-retryable errors", error))}
        </dd>

        <dt>Environment variables</dt>
        <dd>
          {detection.envVars.length === 0
            ? "None found"
            : detection.envVars.map((envVar) => item("Environment variables", envVar))}
        </dd>
      </dl>
      {evidence && shown && (
        <EvidenceDialog code={evidence.code} language={evidence.language} evidence={shown} onClose={() => setShown(null)} />
      )}
    </>
  );
}

type EvidenceDialogProps = { code: string; language: string; evidence: Evidence; onClose(): void };

/** The code, read-only, with one fact's line highlighted, in a modal over the page. */
function EvidenceDialog({ code, language, evidence, onClose }: EvidenceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const highlights = useMemo(() => [{ line: evidence.line, kind: "matched" as const }], [evidence.line]);
  // No close() on cleanup: its close event would call onClose and, under
  // StrictMode's double effect run, unmount the dialog as soon as it opened.
  // Removing the element takes it out of the top layer anyway.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <div className={styles.dialogHeader}>
        <p className={styles.legend}>
          Evidence for <strong>{evidence.fact}</strong>: <span className={styles.swatch} /> where detection found it, line{" "}
          {evidence.line}
        </p>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
      <CodeView value={code} readOnly language={language} height={460} highlights={highlights} />
    </dialog>
  );
}
