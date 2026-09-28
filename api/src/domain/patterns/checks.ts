import type { Check, Declarations } from "../../model/check.js";
import type { RubricEntry } from "../../model/rubric.js";
import { matchCitedLines } from "./pattern-check.js";

/**
 * Turns the publisher's declarations into checks. Idempotency is pattern-matched
 * when at least one cited line matches the rubric entry; otherwise it is declared,
 * with no matched lines. Compensation and heartbeat are always declared.
 */
export function buildChecks(code: string, declarations: Declarations, idempotencyRubric: RubricEntry): Check[] {
  const { idempotency, compensation, heartbeat } = declarations;
  const matchedLines = matchCitedLines(code, idempotency.lines, idempotencyRubric);

  return [
    {
      tag: "idempotency",
      status: idempotency.status,
      established: matchedLines.length > 0 ? "pattern-matched" : "declared",
      lines: idempotency.lines,
      matchedLines,
      rubricTag: idempotencyRubric.tag,
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
  ];
}
