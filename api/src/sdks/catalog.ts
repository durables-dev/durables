import type { Sdk } from "@durables/schemas";
import { storedSdks } from "../storage/schema";
import type { RunsAsWording, SdkEntry } from "./sdk-entry";

// The SDK catalog (ADR 0013): each registry entry's display profile, as web reads it. Web
// looks a profile up by the `sdk` it already receives, and the wording by `runsAs`.

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

/** An SDK's place in chip order: Temporal's order, as `storedSdks` lists it (API map D1). */
const chipPosition = (sdk: Sdk): number => storedSdks.indexOf(sdk);

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
