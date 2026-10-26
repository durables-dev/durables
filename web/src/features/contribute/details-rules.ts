import {
  listingDescriptionMaxLength,
  listingDetailsSchema,
  type ListingDetails,
} from "@durables/schemas";

/** Said under the name when publish found a listing of the publisher's at this address. */
export const nameUsedMessage = "You already have a listing at this address.";

/** The version every listing is published at in the MVP. */
export const firstVersion = "1.0.0";

/** The message under each field that breaks the shared rules. A valid field has none. */
export type DetailsMessages = Partial<Record<keyof ListingDetails, string>>;

/**
 * The message for each field that breaks the shared rules: empty, too long, or a name that
 * breaks the name rule. The wording comes from the rules, so the page and publish agree.
 */
export function detailsMessages(details: ListingDetails): DetailsMessages {
  const parsed = listingDetailsSchema.safeParse(details);
  if (parsed.success) return {};
  const messages: DetailsMessages = {};
  for (const issue of parsed.error.issues) {
    const [field] = issue.path;
    if (field === "title" || field === "name" || field === "description") {
      messages[field] ??= issue.message;
    }
  }
  return messages;
}

/** What the description's counter reads: 160 less its length. Below zero when too long. */
export function charactersLeft(description: string): number {
  return listingDescriptionMaxLength - description.length;
}
