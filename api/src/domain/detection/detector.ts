import type { Detection, Sdk } from "../../model/detection.js";

/** Regex detection for one SDK. Pure: takes the pasted file, returns what it found. */
export interface Detector {
  sdk: Sdk;
  /** Whether the code carries this SDK's marker: its Temporal import (or `using` directive), outside comments. */
  recognises(code: string): boolean;
  detect(code: string): Detection;
}
