// Written from the POC-4 API map, boundary 4 (GET /rubric), and extended by the
// POC-8 API map, boundary 2 (one idempotency entry per SDK).

import type { Sdk } from "./detection.js";

export type RubricTag = "idempotency";

export type RubricEntry = {
  tag: RubricTag;
  sdk: Sdk;
  /** The entry's id on /rubric, and the value of `Check.rubricTag`. */
  anchor: string;
  description: string;
  /** Regex source, exactly as the check applies it. */
  patterns: string[];
};
