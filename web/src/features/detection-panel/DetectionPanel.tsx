import type { Detection } from "../../api/types";
import styles from "./DetectionPanel.module.css";

const SDK_NAMES: Record<Detection["sdk"]["value"], string> = { python: "Python" };

/** Step 1's visible result: what regex detection found in the pasted file. */
export function DetectionPanel({ detection }: { detection: Detection }) {
  return (
    <dl className={styles.facts}>
      <dt>SDK</dt>
      <dd>{SDK_NAMES[detection.sdk.value]}</dd>

      <dt>Activity name</dt>
      <dd>
        <code>{detection.activityName.value}</code>
      </dd>

      <dt>Input types</dt>
      <dd>
        {detection.inputTypes.length === 0
          ? "None"
          : detection.inputTypes.map((input) => (
              <code key={input.name} className={styles.item}>
                {input.name}: {input.type}
              </code>
            ))}
      </dd>

      <dt>Output type</dt>
      <dd>
        <code>{detection.outputType.value}</code>
      </dd>

      <dt>Non-retryable errors</dt>
      <dd>
        {detection.nonRetryableErrorTypes.length === 0
          ? "None found"
          : detection.nonRetryableErrorTypes.map((error) => (
              <code key={error.value} className={styles.item}>
                {error.value}
              </code>
            ))}
      </dd>

      <dt>Environment variables</dt>
      <dd>
        {detection.envVars.length === 0
          ? "None found"
          : detection.envVars.map((envVar) => (
              <code key={envVar.value} className={styles.item}>
                {envVar.value}
              </code>
            ))}
      </dd>
    </dl>
  );
}
