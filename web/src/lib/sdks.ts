import type { Sdk } from "../api/types";

/** Display names for every SDK Durables supports. */
export const SDK_NAMES: Record<Sdk, string> = {
  python: "Python",
  typescript: "TypeScript",
  dotnet: ".NET",
};

/** The Monaco language id for an SDK's activity code. */
export const SDK_LANGUAGES: Record<Sdk, string> = {
  python: "python",
  typescript: "typescript",
  dotnet: "csharp",
};
