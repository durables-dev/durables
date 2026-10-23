import { z } from "zod";

/** The longest title a listing may have. */
export const listingTitleMaxLength = 80;

/** The shortest and longest name in the address. */
export const listingNameMinLength = 3;
export const listingNameMaxLength = 64;

/** The longest one-line description. */
export const listingDescriptionMaxLength = 160;

/**
 * The name in the address: 3 to 64 characters, lowercase letters, numbers and single
 * hyphens, starting and ending with a letter or number. A hyphen must be followed by a
 * letter or number, which rules out a trailing hyphen and two hyphens in a row.
 */
export const listingNamePattern = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,63}$/;

export const listingTitleEmptyMessage = "Enter a title.";

export const listingTitleTooLongMessage = `Use at most ${listingTitleMaxLength} characters.`;

export const listingNameEmptyMessage = "Choose a name.";

export const listingNameFormatMessage = `Use ${listingNameMinLength} to ${listingNameMaxLength} lowercase letters, numbers and single hyphens.`;

export const listingDescriptionEmptyMessage = "Enter a description.";

export const listingDescriptionTooLongMessage = `Use at most ${listingDescriptionMaxLength} characters.`;

/**
 * The title: 1 to 80 characters once leading and trailing whitespace is trimmed. The
 * parsed value is the trimmed title, so whitespace alone counts as empty.
 */
export const listingTitleSchema = z
  .string()
  .trim()
  .min(1, { error: listingTitleEmptyMessage, abort: true })
  .max(listingTitleMaxLength, { error: listingTitleTooLongMessage });

/**
 * The name in the address. Uppercase is refused, never lowercased, and whitespace is never
 * trimmed. An empty name gets the empty wording only.
 */
export const listingNameSchema = z
  .string()
  .min(1, { error: listingNameEmptyMessage, abort: true })
  .regex(listingNamePattern, { error: listingNameFormatMessage });

/**
 * The one-line description: 1 to 160 characters once leading and trailing whitespace is
 * trimmed. The parsed value is the trimmed description.
 */
export const listingDescriptionSchema = z
  .string()
  .trim()
  .min(1, { error: listingDescriptionEmptyMessage, abort: true })
  .max(listingDescriptionMaxLength, {
    error: listingDescriptionTooLongMessage,
  });

/** The listing details from the Details step. A failure's path names the field. */
export const listingDetailsSchema = z.object({
  title: listingTitleSchema,
  name: listingNameSchema,
  description: listingDescriptionSchema,
});

export type ListingDetails = z.infer<typeof listingDetailsSchema>;

/**
 * The six confirmations on the Review step, in the order the page shows them: rights,
 * MIT-0 licence, no secrets, nothing malicious, no responsibility, and the Terms.
 */
export const publishConfirmationKeys = [
  "rights",
  "mitZero",
  "noSecrets",
  "notMalicious",
  "noResponsibility",
  "terms",
] as const;

export type PublishConfirmationKey = (typeof publishConfirmationKeys)[number];

export const publishConfirmationMessage = "Confirm each item above.";

const confirmed = z.literal(true, { error: publishConfirmationMessage });

/**
 * The six confirmations. Each must be present and true; false or missing fails on that
 * confirmation's key.
 */
export const publishConfirmationsSchema = z.object({
  rights: confirmed,
  mitZero: confirmed,
  noSecrets: confirmed,
  notMalicious: confirmed,
  noResponsibility: confirmed,
  terms: confirmed,
});

export type PublishConfirmations = z.infer<typeof publishConfirmationsSchema>;
