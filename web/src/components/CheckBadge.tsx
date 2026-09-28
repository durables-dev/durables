import type { Check } from "../api/types";
import { CHECK_NAMES, ESTABLISHED_NAMES, STATUS_NAMES } from "../lib/checks";
import { Badge } from "./Badge";

/**
 * One evaluation-report check as a badge: ✓ present, ✗ absent, – not applicable.
 * How it was established is always in the tooltip, and also in the label with `showEstablished`.
 */
export function CheckBadge({
  check,
  showEstablished = false,
}: {
  check: Pick<Check, "tag" | "status" | "established">;
  showEstablished?: boolean;
}) {
  const symbol = check.status === "present" ? "✓" : check.status === "absent" ? "✗" : "–";
  return (
    <span title={`${STATUS_NAMES[check.status]}, ${ESTABLISHED_NAMES[check.established]}`}>
      <Badge tone={check.status === "present" ? "success" : "muted"}>
        {symbol} {CHECK_NAMES[check.tag]}
        {showEstablished && ` · ${ESTABLISHED_NAMES[check.established]}`}
      </Badge>
    </span>
  );
}
