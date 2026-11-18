import { z } from "zod";

/**
 * The integrations a listing can show, named as listings store them, in the order the filter
 * chips show them. "Amazon S3" is the one name used everywhere.
 */
export const integrations = [
  "Stripe",
  "Amazon S3",
  "Postgres",
  "Slack",
] as const;

export const integrationSchema = z.enum(integrations);

export type Integration = z.infer<typeof integrationSchema>;

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

/** The longest reason a version's deprecation may give. */
export const deprecationReasonMaxLength = 160;

export const deprecationReasonEmptyMessage = "Enter a reason.";

export const deprecationReasonTooLongMessage = `Use at most ${deprecationReasonMaxLength} characters.`;

/**
 * Why a version is deprecated: 1 to 160 characters once leading and trailing whitespace is
 * trimmed. The parsed value is the trimmed reason, so whitespace alone counts as empty. The
 * Deprecate dialog and the offer to deprecate the base version when publishing both use it.
 */
export const deprecationReasonSchema = z
  .string()
  .trim()
  .min(1, { error: deprecationReasonEmptyMessage, abort: true })
  .max(deprecationReasonMaxLength, { error: deprecationReasonTooLongMessage });

/**
 * A version number: three numbers separated by dots, such as 2.1.0. Each number is 0, or 1 to 9
 * digits with no leading zero, so two different numbers never name the same version.
 */
export const versionNumberPattern =
  /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;

export const versionNumberFormatMessage = "Use three numbers, like 2.1.0.";

/** A version number in the form `versionNumberPattern` allows. Whitespace is never trimmed. */
export const versionNumberSchema = z
  .string()
  .regex(versionNumberPattern, { error: versionNumberFormatMessage });

/**
 * Compares two version numbers that match `versionNumberPattern`, major first, then minor, then
 * patch, each as a number. Negative when `a` is lower, positive when it is higher, and 0 when
 * they are the same version.
 */
export const compareVersionNumbers = (a: string, b: string): number => {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let part = 0; part < 3; part++) {
    const difference = (left[part] ?? 0) - (right[part] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

/** The message under the version field when the listing already has that version. */
export const versionTakenMessage = (version: string) =>
  `${version} already exists. Versions can't be published twice.`;

/** The message under the version field when it is not higher than the listing's latest. */
export const versionNotHigherMessage = (latest: string) =>
  `Must be higher than ${latest}, the latest. Versions can't go backwards.`;

/** The longest What changed note a new version may have. */
export const whatChangedMaxLength = 160;

export const whatChangedEmptyMessage = "Say what changed.";

export const whatChangedTooLongMessage = `Use at most ${whatChangedMaxLength} characters.`;

/**
 * A new version's What changed note: 1 to 160 characters once leading and trailing whitespace
 * is trimmed. The parsed value is the trimmed note, so whitespace alone counts as empty. It
 * can't be changed after publishing.
 */
export const whatChangedSchema = z
  .string()
  .trim()
  .min(1, { error: whatChangedEmptyMessage, abort: true })
  .max(whatChangedMaxLength, { error: whatChangedTooLongMessage });

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
