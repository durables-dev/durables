import { listingDescriptionSchema } from "@durables/schemas";
import { z } from "zod";

// The request that saves a listing's description. The description follows the shared rule
// used at publish: trimmed, not empty, at most 160 characters. Any other field is dropped.

/** The body of `PATCH /api/activities/:handle/:name`. The parsed description is trimmed. */
export const descriptionBody = z.object({
  description: listingDescriptionSchema,
});

export type DescriptionBody = z.infer<typeof descriptionBody>;
