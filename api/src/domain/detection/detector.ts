import type { Detection, Sdk } from "../../model/detection.js";

/** Regex detection for one SDK. Pure: takes the pasted file, returns what it found. */
export interface Detector {
  sdk: Sdk;
  detect(code: string): Detection;
}
