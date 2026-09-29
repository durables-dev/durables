// Written from the POC-5 API map, boundaries 2 and 5.

import type { Check, Declarations } from "./check.js";
import type { Detection, Sdk } from "./detection.js";

export type PublishRequest = {
  code: string;
  declarations: Declarations;
  readme: string;
  exampleInput: Record<string, unknown>;
  /** Required when the name is already published; ignored on a first publish (always 1.0.0). POC-11 API map, boundary 3. */
  version?: string;
};

export type PublishResult = {
  address: string;
  owner: string;
  name: string;
  version: string;
};

/** One published version of an activity: a document in DocumentStore. Immutable once written. */
export type ActivityVersion = {
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  sdk: Sdk;
  code: string;
  detection: Detection;
  declarations: Declarations;
  checks: Check[];
  readme: string;
  exampleInput: Record<string, unknown>;
};
