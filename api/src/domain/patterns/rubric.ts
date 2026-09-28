import type { RubricEntry } from "../../model/rubric.js";

// The published rubric. GET /rubric serves these entries as they are, and the
// pattern check compiles the same strings, so what is published is exactly
// what is checked.

export const PYTHON_IDEMPOTENCY: RubricEntry = {
  tag: "idempotency",
  sdk: "python",
  description:
    "A cited line sends an idempotency key to the external system: it sets an Idempotency-Key HTTP header, or passes an idempotency_key= keyword argument to a client call.",
  patterns: [
    // An Idempotency-Key header set in a dict literal, by add_header/putheader, or by item assignment.
    String.raw`["'][Ii]dempotency-[Kk]ey["']\s*(?:[:,]|\]\s*=(?!=))`,
    // An idempotency_key= keyword argument, as payment SDK clients take it.
    String.raw`[(,]\s*idempotency_key\s*=(?!=)`,
  ],
};

export const RUBRIC: RubricEntry[] = [PYTHON_IDEMPOTENCY];
