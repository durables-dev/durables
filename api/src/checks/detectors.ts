import type { Detector } from "./detector";
import { pythonDetector } from "./python-detector";
import { typescriptDetector } from "./typescript-detector";

/**
 * The detectors for the accepted SDKs, in the order the pipeline prefers them when a file has
 * activity markers for more than one. Each SDK's detector is added here as it is built.
 */
export const detectors: readonly Detector[] = [
  pythonDetector,
  typescriptDetector,
];
