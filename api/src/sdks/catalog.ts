import { storedSdks } from "../storage/schema";
import type { RunsAsWording, SdkEntry } from "./sdk-entry";
import type { Sdk } from "./sdk-list";

// The SDK catalog (ADR 0013): each registry entry's display profile, as web reads it. Web
// looks a profile up by the `sdk` it already receives, and the wording by `runsAs`. A logo is
// published as the address of the logo route, never as the SVG itself.

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
  /** Where the SDK's logo is served. Left out when the SDK has no logo, as for Java. */
  logoUrl?: string;
  /** The credit the logo's licence requires, shown as its tooltip. Left out when none is due. */
  credit?: string;
  /** Set when the logo sits on a light tile. Left out otherwise. */
  lightTile?: boolean;
}

/** The address `GET /api/sdks/{name}/logo.svg` serves an SDK's logo at. */
export const sdkLogoPath = (sdk: Sdk): string =>
  `/api/sdks/${encodeURIComponent(sdk)}/logo.svg`;

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
      ...(display.logo === undefined ? {} : { logoUrl: sdkLogoPath(sdk) }),
      ...(display.credit === undefined ? {} : { credit: display.credit }),
      ...(display.lightTile === undefined
        ? {}
        : { lightTile: display.lightTile }),
    }));
