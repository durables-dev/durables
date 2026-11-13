import {
  type ListingDetails,
  listingDetailsSchema,
  publishConfirmationKeys,
  type PublishConfirmationKey,
  publishConfirmationsSchema,
} from "@durables/schemas";
import { z } from "zod";
import { fieldErrors } from "../http/validation";
import { MAX_CODE_BYTES } from "../checks/size-limit";
import { sdkSchema } from "../sdks/sdk-list";
import { invalidListing } from "./publish-problems";

// The publish request. Its shape is checked by the validator, which answers 400. Its content
// is checked by the shared listing rules, which answer 422. Only the code and the declared SDK
// are taken from the client: detection results, integrations, snippets and the version are
// never read from it.

/**
 * The largest publish request body, in bytes. It fits code of `MAX_CODE_BYTES` even when JSON
 * escapes every byte as six (`\u00XX`), with room for the details and confirmations. The
 * code's own size is checked by the checks pipeline, which answers 413 above the limit.
 */
export const MAX_PUBLISH_BODY_BYTES = 6 * MAX_CODE_BYTES + 16 * 1024;

/** The version every publish creates. New versions are a later increment. */
export const FIRST_VERSION = "1.0.0";

const confirmationShape = Object.fromEntries(
  publishConfirmationKeys.map((key) => [key, z.boolean()]),
) as Record<PublishConfirmationKey, z.ZodBoolean>;

/**
 * The shape of a publish body. Any other field, such as facts or a version sent by the
 * client, is dropped.
 */
export const publishBody = z.object({
  /** The code exactly as pasted. */
  code: z.string(),
  /** The SDK the publisher chose. Publishing runs its detector instead of identifying one. */
  declaredSdk: sdkSchema.optional(),
  title: z.string(),
  name: z.string(),
  description: z.string(),
  /** The six confirmations, each true or false. */
  confirmations: z.object(confirmationShape),
});

export type PublishBody = z.infer<typeof publishBody>;

/**
 * Applies the shared listing rules to the details and the confirmations, and returns the
 * parsed details: title and description trimmed.
 *
 * @throws {ProblemError} 422, with one error per failing field, when a detail is invalid or a
 * confirmation is false. Confirmation fields are named `confirmations.<key>`.
 */
export const acceptListing = ({
  title,
  name,
  description,
  confirmations,
}: PublishBody): ListingDetails => {
  const details = listingDetailsSchema.safeParse({ title, name, description });
  const confirmed = publishConfirmationsSchema.safeParse(confirmations);
  if (details.success && confirmed.success) {
    return details.data;
  }
  throw invalidListing(
    fieldErrors([
      ...(details.error?.issues ?? []),
      ...(confirmed.error?.issues ?? []).map((issue) => ({
        ...issue,
        path: ["confirmations", ...issue.path],
      })),
    ]),
  );
};
