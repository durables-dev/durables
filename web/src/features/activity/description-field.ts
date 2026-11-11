import {
  listingDescriptionMaxLength,
  listingDescriptionSchema,
} from "@durables/schemas";

// The one-line description field in the Update dialog. It follows the shared rule the
// contribute Details step uses, with the same wording.

/** What the help line's counter reads: 160 less what was typed. Below zero when too long. */
export function charactersLeft(typed: string): number {
  return listingDescriptionMaxLength - typed.length;
}

/**
 * The message under the field for what is typed now, or undefined when there is none.
 * Too long shows while typing. Empty or blank shows only once Save has been tried.
 */
export function descriptionMessage(
  typed: string,
  saveTried: boolean,
): string | undefined {
  const parsed = listingDescriptionSchema.safeParse(typed);
  if (parsed.success) return undefined;
  const [issue] = parsed.error.issues;
  if (issue === undefined) return undefined;
  return saveTried || issue.code === "too_big" ? issue.message : undefined;
}
