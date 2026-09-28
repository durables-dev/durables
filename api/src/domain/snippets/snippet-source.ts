import type { Detection } from "../../model/detection.js";

/** What every SDK's generator reads from a stored activity version. */
export type SnippetSource = {
  /** The listing name, used as the task queue and the workflow ID prefix. */
  name: string;
  code: string;
  detection: Detection;
  exampleInput: Record<string, unknown>;
};
