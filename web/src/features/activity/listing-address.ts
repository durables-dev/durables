import { handleSchema, listingNameSchema } from "@durables/schemas";
import { z } from "zod";

/** Where a published version lives: `handle/name@version`. */
export interface ListingAddress {
  handle: string;
  name: string;
  version: string;
}

/** A version number: three whole numbers, such as 1.0.0, with no leading zeros. */
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

/** The second part of the path, `name@version`, split at the first "@". */
const nameAtVersionSchema = z
  .string()
  .transform((value, context) => {
    const at = value.indexOf("@");
    if (at === -1) {
      context.addIssue({ code: "custom", message: "No version." });
      return z.NEVER;
    }
    return { name: value.slice(0, at), version: value.slice(at + 1) };
  })
  .pipe(
    z.object({
      name: listingNameSchema,
      version: z.string().regex(versionPattern),
    }),
  );

// A reserved handle fails handleSchema, so a site page such as /terms is never read as a
// publisher's listing.
const listingParamsSchema = z
  .object({ handle: handleSchema, nameAtVersion: nameAtVersionSchema })
  .transform(({ handle, nameAtVersion }) => ({ handle, ...nameAtVersion }));

/**
 * The listing address in the route's params, from the path `/:handle/:nameAtVersion`, or
 * undefined when the path cannot be a listing's address. Uppercase is refused, never
 * lowercased, as the API does.
 */
export function parseListingAddress(
  params: Readonly<Record<string, string | undefined>>,
): ListingAddress | undefined {
  const parsed = listingParamsSchema.safeParse(params);
  return parsed.success ? parsed.data : undefined;
}
