import { z } from "zod";

// The latest check of the pasted code, as the draft keeps it: what detection found, or why
// the file was refused. It is read back from sessionStorage after a reload, so it is parsed
// rather than trusted. The facts follow the checks pipeline's Facts (api: checks/facts.ts).

const lineRefSchema = z.object({ line: z.number().int().positive() });

const namedLineRefSchema = lineRefSchema.extend({ name: z.string() });

export const factsSchema = z.object({
  sdk: z.enum(["Python", "TypeScript", ".NET"]),
  activity: namedLineRefSchema,
  input: z.string().nullable(),
  output: z.string().nullable(),
  runsAs: z.enum(["async", "sync"]).nullable(),
  nonRetryableErrors: z.array(lineRefSchema),
  configurationRead: z.array(namedLineRefSchema),
  dependencies: z.array(namedLineRefSchema),
  heartbeats: z.array(lineRefSchema),
});

/** The eight facts detection reports about an accepted file. */
export type CheckedFacts = z.infer<typeof factsSchema>;

/**
 * A refusal's Problem Details. Extension members, such as the unaccepted SDK or the number
 * of activities, are kept so the step can show them.
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
