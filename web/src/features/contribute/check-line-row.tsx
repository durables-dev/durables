import type { CheckLine } from "./check-line";
import styles from "./check-line-row.module.css";
import { PublishedCode } from "./published-code";

export interface CheckLineRowProps {
  line: CheckLine;
  /** The code in the editor, which "View what will be published" shows. */
  code: string;
}

// The row under the paste editor: what the latest check found, or why it refused the file.
// The message sits in a status region that is always in the markup, so each new result is
// announced. An accepted file shows the Found line, with "View what will be published" at
// the right of the row to open the code in a read-only dialog. A refusal shows in a
// Gold-tint panel.
export function CheckLineRow({ line, code }: CheckLineRowProps) {
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
        <PublishedCode code={code} sdk={line.facts.sdk} />
      ) : null}
    </div>
  );
}
