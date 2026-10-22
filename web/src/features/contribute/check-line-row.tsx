import type { CheckLine } from "./check-line";
import styles from "./check-line-row.module.css";

export interface CheckLineRowProps {
  line: CheckLine;
}

// The row under the paste editor: what the latest check found, or why it refused the file.
// The message sits in a status region that is always in the markup, so each new result is
// announced. An accepted file shows the Found line, with "View what will be published" at
// the right of the row. A refusal shows in a Gold-tint panel.
export function CheckLineRow({ line }: CheckLineRowProps) {
  return (
    <div className={styles["row"]}>
      <div role="status" className={styles["status"]}>
        {line.kind === "checking" ? (
          <p className={styles["checking"]}>{line.text}</p>
        ) : null}
        {line.kind === "found" ? (
          <p className={styles["found"]}>{line.text}</p>
        ) : null}
        {line.kind === "refused" ? (
          <p className={styles["refused"]}>{line.text}</p>
        ) : null}
        {line.kind === "failed" ? (
          <p className={styles["failed"]}>{line.text}</p>
        ) : null}
      </div>
      {line.kind === "found" ? (
        // The "What will be published" dialog comes with its own story, and opens from here.
        <button type="button" className={styles["view"]}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View what will be published
        </button>
      ) : null}
    </div>
  );
}
