import { z } from "zod";

// The latest check of the pasted code, as the draft keeps it: what detection found, or why
// the file was refused. It is read back from sessionStorage after a reload, so it is parsed
// rather than trusted. The facts follow the checks pipeline's Facts (api: checks/facts.ts).
// The SDK is a name the api gives; web holds no SDK list to check it against.

const lineRefSchema = z.object({ line: z.number().int().positive() });

const namedLineRefSchema = lineRefSchema.extend({ name: z.string() });

/**
 * How the SDK was established. Detected: a Temporal marker named it. Inferred: the language and
 * the function's shape suggested it, with no marker. Declared: the publisher chose it.
 */
export const sdkTierSchema = z.enum(["detected", "inferred", "declared"]);

export type SdkTier = z.infer<typeof sdkTierSchema>;

/**
 * How each fact was established. Only the SDK's tier is shown, so only it is read. A check kept
 * from before the api recorded tiers has none, and its SDK reads as detected.
 */
const provenanceSchema = z.looseObject({ sdk: sdkTierSchema });

export const factsSchema = z.object({
  sdk: z.string().min(1),
  activity: namedLineRefSchema,
  input: z.string().nullable(),
  output: z.string().nullable(),
  runsAs: z.enum(["async", "sync"]).nullable(),
  nonRetryableErrors: z.array(lineRefSchema),
  configurationRead: z.array(namedLineRefSchema),
  dependencies: z.array(namedLineRefSchema),
  heartbeats: z.array(lineRefSchema),
  provenance: provenanceSchema.optional(),
});

/** The eight facts detection reports about an accepted file. */
export type CheckedFacts = z.infer<typeof factsSchema>;

/** How the facts' SDK was established. */
export function sdkTier(facts: CheckedFacts): SdkTier {
  return facts.provenance?.sdk ?? "detected";
}

/**
 * A refusal's Problem Details. Extension members, such as why the SDK must be chosen or the
 * number of activities, are kept so the step can show them.
 */
const refusalSchema = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
});

export const checkResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("accepted"), facts: factsSchema }),
  z.object({ outcome: z.literal("refused"), problem: refusalSchema }),
]);

/** The latest check of the pasted code: the file was accepted, or it was refused. */
export type CheckResult = z.infer<typeof checkResultSchema>;
