import { z } from "zod";

/** The two choices the Restore prompt offers, as its buttons name them in the form. */
export const restoreChoiceSchema = z.enum(["restore", "start-over"]);

export type RestoreChoiceName = z.infer<typeof restoreChoiceSchema>;

/** What the prompt says when a choice did not finish. The choice stays available. */
export function choiceFailedMessage(choice: RestoreChoiceName): string {
  return choice === "restore"
    ? "Restoring didn't finish. Try again."
    : "Starting as a new user didn't finish. Try again.";
}

const finalDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * The day a pending deletion becomes final, as the prompt shows it: "17 December 2026", in the
 * visitor's own time zone. Undefined when the time cannot be read.
 */
export function finalDate(finalAt: string): string | undefined {
  const date = new Date(finalAt);
  return Number.isNaN(date.getTime())
    ? undefined
    : finalDateFormat.format(date);
}
