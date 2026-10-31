import type { Sdk } from "./configure-section";

/**
 * The package each Temporal SDK is installed as, shown beside the SDK in the About card.
 * TypeScript's SDK ships as several `@temporalio` packages; the activity package is the one
 * published activity code imports.
 */
export const sdkPackage: Readonly<Record<Sdk, string>> = {
  Python: "temporalio",
  TypeScript: "@temporalio/activity",
  ".NET": "Temporalio",
};
