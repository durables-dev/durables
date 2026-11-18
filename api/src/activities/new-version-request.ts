import {
  deprecationReasonSchema,
  listingDescriptionSchema,
  listingTitleSchema,
  publishConfirmationsSchema,
  versionNumberSchema,
  whatChangedSchema,
} from "@durables/schemas";
import { z } from "zod";
import { fieldErrors } from "../http/validation";
import { invalidListing } from "./publish-problems";
import { publishBody } from "./publish-request";

// The request that publishes a later version of an existing listing (ADR 0015). As with a first
// publish, its shape is checked by the validator, which answers 400, and its content by the
// shared rules, which answer 422. The handle and name come from the address, never the body.
// Only the code and the declared SDK are taken from the client for the checks: detection
// results, integrations and snippets are never read from it.

/**
 * The shape of a new version's body: a first publish's body without the name, plus the version
 * number, the version it was based on, the What changed note and the optional deprecation of
 * the base version. Any other field is dropped. A missing deprecation is null.
 */
export const newVersionBody = publishBody.omit({ name: true }).extend({
  version: z.string(),
  basedOn: z.string(),
  whatChanged: z.string(),
  /** Deprecates the base version, with the new version as its replacement. */
  deprecateBase: z.object({ reason: z.string() }).nullable().default(null),
});

export type NewVersionBody = z.infer<typeof newVersionBody>;

/** The new version's details once the shared rules have accepted them. */
export const newVersionDetailsSchema = z.object({
  title: listingTitleSchema,
  description: listingDescriptionSchema,
  version: versionNumberSchema,
  whatChanged: whatChangedSchema,
  deprecateBase: z.object({ reason: deprecationReasonSchema }).nullable(),
});

export type NewVersionDetails = z.infer<typeof newVersionDetailsSchema>;

/**
 * Applies the shared rules to the details, the What changed note, the base deprecation's reason
 * and the confirmations, and returns the parsed details: title, description, note and reason
 * trimmed.
 *
 * @throws {ProblemError} 422, with one error per failing field, when any of them is invalid or
 * a confirmation is false. The reason is named `deprecateBase.reason`, and confirmations
 * `confirmations.<key>`.
 */
export const acceptNewVersion = ({
  title,
  description,
  version,
  whatChanged,
  deprecateBase,
  confirmations,
}: NewVersionBody): NewVersionDetails => {
  const details = newVersionDetailsSchema.safeParse({
    title,
    description,
    version,
    whatChanged,
    deprecateBase,
  });
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
