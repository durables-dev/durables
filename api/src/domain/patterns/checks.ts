import type { Check, Declarations } from "../../model/check.js";
import type { Detection } from "../../model/detection.js";
import type { RubricEntry } from "../../model/rubric.js";
import { matchCitedLines } from "./pattern-check.js";

/**
 * Builds the evaluation report. Idempotency is pattern-matched when at least one
 * cited line matches the rubric entry; otherwise it is declared, with no matched
 * lines. Compensation and heartbeat are always declared. Non-retryable errors are
 * detected: present when detection found at least one type, with its lines.
 */
export function buildChecks(
  code: string,
  declarations: Declarations,
  detection: Detection,
  idempotencyRubric: RubricEntry,
): Check[] {
  const { idempotency, compensation, heartbeat } = declarations;
  const matchedLines = matchCitedLines(code, idempotency.lines, idempotencyRubric);
  const errors = detection.nonRetryableErrorTypes;

  return [
    {
      tag: "idempotency",
      status: idempotency.status,
      established: matchedLines.length > 0 ? "pattern-matched" : "declared",
      lines: idempotency.lines,
      matchedLines,
      rubricTag: idempotencyRubric.anchor,
    },
    {
      tag: "compensation",
      status: compensation.status,
      established: "declared",
      ...(compensation.address ? { address: compensation.address.trim() } : {}),
    },
    {
      tag: "heartbeat",
      status: heartbeat.status,
      established: "declared",
      ...(heartbeat.status === "not-applicable" && heartbeat.reason ? { reason: heartbeat.reason } : {}),
    },
    {
      tag: "non-retryable-errors",
      status: errors.length > 0 ? "present" : "absent",
      established: "detected",
      lines: errors.map((error) => error.line),
      errorTypes: errors.map((error) => error.value),
    },
  ];
}
