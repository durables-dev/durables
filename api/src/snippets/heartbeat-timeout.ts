import type { FactValues } from "../checks/facts";

// The heartbeat timeout the generated workflow sets when detection found the activity
// heartbeating. Without one, Temporal never acts on a missed heartbeat, so a stalled attempt
// waits out its whole start-to-close timeout before the next one starts.

/** Why the workflow sets the timeout, as one comment line's text. */
const reason =
  "The activity heartbeats. Temporal fails an attempt that sends no heartbeat within this timeout.";

/** Whether detection found the activity heartbeating. */
export const heartbeats = (facts: Pick<FactValues, "heartbeats">) =>
  facts.heartbeats.length > 0;

/**
 * The lines that set the heartbeat timeout, after a comment that starts with the language's
 * comment marker, or "" when the activity never heartbeats, which removes a block placeholder's
 * line.
 */
export const heartbeatTimeoutLines = (
  facts: Pick<FactValues, "heartbeats">,
  commentMarker: string,
  option: string,
) => (heartbeats(facts) ? `${commentMarker} ${reason}\n${option}` : "");

/** The comment line alone, for a language whose option is placed by its own template. */
export const heartbeatTimeoutComment = (commentMarker: string) =>
  `${commentMarker} ${reason}`;
