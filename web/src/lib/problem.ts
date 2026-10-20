import { DetailedError } from "hono/client";
import { z } from "zod";

// RFC 9457 Problem Details, the body of every API error response (api: http/problem.ts).
// parseResponse throws DetailedError on a non-2xx status; problemFrom narrows it to this.

const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z
    .array(z.object({ field: z.string(), message: z.string() }))
    .optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/**
 * The Problem Details an API call failed with, or undefined when the error is not an API
 * response. A response whose body is not Problem Details is described by its status alone.
 */
export function problemFrom(error: unknown): ProblemDetails | undefined {
  if (!(error instanceof DetailedError)) return undefined;
  const detail: unknown = error.detail;
  const body =
    typeof detail === "object" && detail !== null && "data" in detail
      ? detail.data
      : undefined;
  const parsed = problemDetailsSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const status: unknown = error.statusCode;
  return typeof status === "number"
    ? { type: "about:blank", title: error.message, status }
    : undefined;
}

/** The message the API gave for one request field, if it named that field. */
export function fieldMessage(
  problem: ProblemDetails,
  field: string,
): string | undefined {
  return problem.errors?.find((error) => error.field === field)?.message;
}
