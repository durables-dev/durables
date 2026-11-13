import type { ActivityFacts } from "./facts";
import type { Source } from "./source";

/**
 * Detection for one SDK. Identification has already chosen the SDK; the detector reads the
 * file's activities in it.
 */
export interface Detector {
  /**
   * Every activity in the file, in the order they appear. Empty when there is none.
   * `isStandardLibrary` is the SDK entry's standard-library check; Dependencies leaves out
   * every name it accepts.
   */
  detect(
    source: Source,
    isStandardLibrary: (name: string) => boolean,
  ): readonly ActivityFacts[];
}
