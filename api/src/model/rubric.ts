// Written from the POC-4 API map, boundary 4 (GET /rubric).

import type { Sdk } from "./detection.js";

export type RubricTag = "idempotency";

export type RubricEntry = {
  tag: RubricTag;
  sdk: Sdk;
  description: string;
  /** Regex source, exactly as the check applies it. */
  patterns: string[];
};
