import type { Sdk } from "../../model/detection.js";
import type { RubricEntry } from "../../model/rubric.js";

// The published rubric. GET /rubric serves these entries as they are, and the
// pattern check compiles the same strings, so what is published is exactly
// what is checked. Each SDK has its own idempotency entry, so a cited line is
// checked against rules for its own language. The Python entry keeps the
// `idempotency` anchor that stored Python checks already link to.

export const PYTHON_IDEMPOTENCY: RubricEntry = {
  tag: "idempotency",
  sdk: "python",
  anchor: "idempotency",
  description:
    "A cited line sends an idempotency key to the external system: it sets an Idempotency-Key HTTP header, or passes an idempotency_key= keyword argument to a client call.",
  patterns: [
    // An Idempotency-Key header set in a dict literal, by add_header/putheader, or by item assignment.
    String.raw`["'][Ii]dempotency-[Kk]ey["']\s*(?:[:,]|\]\s*=(?!=))`,
    // An idempotency_key= keyword argument, as payment SDK clients take it.
    String.raw`[(,]\s*idempotency_key\s*=(?!=)`,
  ],
};

export const TYPESCRIPT_IDEMPOTENCY: RubricEntry = {
  tag: "idempotency",
  sdk: "typescript",
  anchor: "idempotency-typescript",
  description:
    "A cited line sends an idempotency key to the external system: it sets an Idempotency-Key HTTP header in a headers object or with headers.set/append, or passes an idempotencyKey option to a client call.",
  patterns: [
    // An Idempotency-Key header as a key in an object literal: { "Idempotency-Key": key }.
    String.raw`["'][Ii]dempotency-[Kk]ey["']\s*:`,
    // An Idempotency-Key header set on a Headers object: headers.set("Idempotency-Key", key), or append.
    String.raw`\.(?:set|append)\(\s*["'][Ii]dempotency-[Kk]ey["']\s*,`,
    // An idempotencyKey option, as payment SDK clients take it (a type annotation `: string` doesn't count).
    String.raw`\bidempotencyKey\s*:(?!\s*string\b)`,
  ],
};

export const DOTNET_IDEMPOTENCY: RubricEntry = {
  tag: "idempotency",
  sdk: "dotnet",
  anchor: "idempotency-dotnet",
  description:
    "A cited line sends an idempotency key to the external system: it adds an Idempotency-Key HTTP header with Headers.Add or TryAddWithoutValidation, or sets an IdempotencyKey property on a client's request options.",
  patterns: [
    // An Idempotency-Key header added to a request: request.Headers.Add("Idempotency-Key", key).
    String.raw`\.(?:Add|TryAddWithoutValidation)\(\s*"[Ii]dempotency-[Kk]ey"\s*,`,
    // An IdempotencyKey property set in an object initializer or by assignment, as payment SDK options take it.
    String.raw`\bIdempotencyKey\s*=(?![=>])`,
  ],
};

export const RUBRIC: RubricEntry[] = [PYTHON_IDEMPOTENCY, TYPESCRIPT_IDEMPOTENCY, DOTNET_IDEMPOTENCY];

/** The idempotency entry a cited line in code of this SDK is checked against. */
export function idempotencyRubricFor(sdk: Sdk): RubricEntry {
  const entry = RUBRIC.find((candidate) => candidate.tag === "idempotency" && candidate.sdk === sdk);
  if (!entry) throw new Error(`No idempotency rubric entry for ${sdk}`);
  return entry;
}
