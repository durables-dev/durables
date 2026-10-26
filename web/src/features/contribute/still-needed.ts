import { listingDetailsSchema, type ListingDetails } from "@durables/schemas";
import { steps, type StepId } from "./steps";

/**
 * The labels of the steps before Review that are not finished, in step order. Details also
 * counts as unfinished while its fields break the listing rules, as after the publisher goes
 * back and clears one.
 */
export function stillNeeded(
  finished: readonly StepId[],
  details: ListingDetails,
): string[] {
  return steps
    .filter(({ id }) => id !== "review")
    .filter(
      ({ id }) =>
        !finished.includes(id) ||
        (id === "details" && !listingDetailsSchema.safeParse(details).success),
    )
    .map(({ label }) => label);
}
