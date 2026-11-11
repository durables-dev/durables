import type { CheckedFacts } from "./check-result";

// The eight facts on the Detected step's "What we found" card, as the publisher reads them.
// Line numbers are shown as detection reports them, which is how the editor and "What will
// be published" number the code (API map row D31).

/** One fact on the card. */
export interface FactRow {
  label: string;
  value: string;
  /** False when detection found nothing, so the value is a fallback shown muted. */
  found: boolean;
}

/** Said when a type or the way an activity runs can't be read. */
export const unreadable = "—";

function found(label: string, value: string): FactRow {
  return { label, value, found: true };
}

function fallback(label: string, value: string): FactRow {
  return { label, value, found: false };
}

/** "line 7", or "lines 7, 12" when there are several. */
function lineList(lines: readonly { line: number }[]): string {
  const numbers = lines.map(({ line }) => String(line)).join(", ");
  return lines.length === 1 ? `line ${numbers}` : `lines ${numbers}`;
}

function inputOutput({ input, output }: CheckedFacts): FactRow {
  const label = "Input → output";
  if (input === null && output === null) return fallback(label, unreadable);
  return found(label, `${input ?? unreadable} → ${output ?? unreadable}`);
}

function runsAs({ runsAs }: CheckedFacts): FactRow {
  const label = "Runs as";
  switch (runsAs) {
    case "async":
      return found(label, "Async");
    case "sync":
      return found(label, "Synchronous: the worker needs a thread pool");
    case null:
      return fallback(label, unreadable);
  }
}

function nonRetryableErrors({ nonRetryableErrors }: CheckedFacts): FactRow {
  const label = "Non-retryable errors";
  return nonRetryableErrors.length === 0
    ? fallback(label, "None raised")
    : found(label, `Raised on ${lineList(nonRetryableErrors)}`);
}

function configurationRead({ configurationRead }: CheckedFacts): FactRow {
  const label = "Configuration read";
  return configurationRead.length === 0
    ? fallback(label, "None")
    : found(
        label,
        configurationRead
          .map(({ name, line }) => `${name} (line ${String(line)})`)
          .join(", "),
      );
}

function dependencies({ dependencies }: CheckedFacts): FactRow {
  const label = "Dependencies";
  return dependencies.length === 0
    ? fallback(label, "None beyond the SDK")
    : found(label, dependencies.map(({ name }) => name).join(", "));
}

function heartbeats({ heartbeats }: CheckedFacts): FactRow {
  const label = "Heartbeats";
  return heartbeats.length === 0
    ? fallback(label, "Not detected")
    : found(label, `Yes, ${lineList(heartbeats)}`);
}

/** The card's eight facts, in the order screen 12 shows them: left column, then right. */
export function factRows(facts: CheckedFacts): FactRow[] {
  return [
    found("SDK", facts.sdk),
    found("Activity", facts.activity.name),
    inputOutput(facts),
    runsAs(facts),
    nonRetryableErrors(facts),
    configurationRead(facts),
    dependencies(facts),
    heartbeats(facts),
  ];
}
