import { deprecationReasonSchema } from "@durables/schemas";
import { z } from "zod";

// The request that deprecates one version (ADR 0015). The reason follows the shared rule the
// Deprecate dialog uses: trimmed, not empty, at most 160 characters. The replacement is a
// version number of the same listing, or null for no replacement. Whether it is one of the
// listing's versions, and not the deprecated version itself, is checked against the listing.
// Any other field is dropped.

/**
 * The body of `PUT /api/activities/:handle/:name/versions/:version/deprecation`. The parsed
 * reason is trimmed, and a missing replacement is null.
 */
export const deprecationBody = z.object({
  reason: deprecationReasonSchema,
  replacement: z
    .string()
    .min(1, "Choose a version, or no replacement.")
    .nullable()
    .default(null),
});
