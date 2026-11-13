import type { ActivityFacts } from "./facts";
import type { Source } from "./source";

/**
 * Detection for one SDK. Identification has already chosen the SDK; the detector reads the
 * file's activities in it.
 */
export interface Detector {
  /** Every activity in the file, in the order they appear. Empty when there is none. */
  detect(source: Source): readonly ActivityFacts[];
}
