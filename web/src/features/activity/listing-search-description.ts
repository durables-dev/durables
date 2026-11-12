export interface ListingSearchDescriptionInput {
  /** The listing's one-line description, as the publisher wrote it. */
  description: string;
  sdk: string;
  handle: string;
}

/**
 * The search-result description for an Activity page: the publisher's one line, then what it
 * is and who published it, e.g. "Charges a card through Stripe. A Python Temporal activity
 * by acme on Durables." A full stop is added when the line ends without one.
 */
export function listingSearchDescription({
  description,
  sdk,
  handle,
}: ListingSearchDescriptionInput): string {
  const line = description.trim();
  const sentence = /[.!?]$/.test(line) ? line : `${line}.`;
  return `${sentence} A ${sdk} Temporal activity by ${handle} on Durables.`;
}
