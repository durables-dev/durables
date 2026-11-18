import { listingDescriptionSchema } from "@durables/schemas";
import { z } from "zod";

// The request that saves one version's description (ADR 0015). The description follows the
// shared rule used at publish: trimmed, not empty, at most 160 characters. The version names
// which of the listing's versions to change. Any other field is dropped.

/** The body of `PATCH /api/activities/:handle/:name`. The parsed description is trimmed. */
export const descriptionBody = z.object({
  version: z.string().min(1, "Name the version to change."),
  description: listingDescriptionSchema,
});
