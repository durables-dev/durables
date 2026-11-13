import type { Sdk } from "@durables/schemas";
import type { RunsAsWording, SdkEntry } from "./sdk-entry";

// The SDK catalog (ADR 0013): each registry entry's display profile, as web reads it. Web
// looks a profile up by the `sdk` it already receives, and the wording by `runsAs`.

/**
 * Every SDK Temporal officially supports, in Temporal's order, which is the order the filter
 * chips show them (API map D1). An SDK in the shared list but missing here does not compile.
 */
export const chipOrder = [
  "Go",
  "Java",
  "Python",
  "TypeScript",
  ".NET",
  "Ruby",
  "PHP",
  "Rust",
] as const;

/** One SDK in the catalog, as `GET /api/sdks` answers it. */
export interface SdkProfile {
  /** The SDK, named as listings and the version response name it. */
  name: Sdk;
  /** The package shown beside the SDK on the About card. */
  package: string;
  /** The language its code is highlighted in. */
  highlightLanguage: string;
  /** The file the published code is saved as. */
  activityFileName: string;
  /** The Runs as value on the What we found card, for each `runsAs`. */
  runsAs: RunsAsWording;
  /** The Worker requirements sentence in the Configure section, for each `runsAs`. */
  workerRequirements: RunsAsWording;
}

const chipPosition = (sdk: Sdk): number => chipOrder.indexOf(sdk);

/** The catalog: one profile per entry, in chip order, whatever order the entries come in. */
export const sdkCatalog = (entries: readonly SdkEntry[]): SdkProfile[] =>
  [...entries]
    .sort((a, b) => chipPosition(a.sdk) - chipPosition(b.sdk))
    .map(({ sdk, display }) => ({
      name: sdk,
      package: display.package,
      highlightLanguage: display.highlightLanguage,
      activityFileName: display.activityFileName,
      runsAs: { sync: display.runsAs.sync, async: display.runsAs.async },
      workerRequirements: {
        sync: display.workerRequirements.sync,
        async: display.workerRequirements.async,
      },
    }));
