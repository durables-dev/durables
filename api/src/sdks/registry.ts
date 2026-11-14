import { dotnet } from "./dotnet";
import { go } from "./go";
import { java } from "./java";
import { python } from "./python";
import type { SdkEntry, SdkRegistry } from "./sdk-entry";
import { sdks } from "./sdk-list";
import { typescript } from "./typescript";

// The SDK registry (ADR 0013): every SDK's specifics, in one place in the api. Adding an SDK
// is one entry here and its name in the api's SDK list (`sdk-list.ts`).

export const sdkRegistry: SdkRegistry = {
  Go: go,
  Java: java,
  Python: python,
  TypeScript: typescript,
  ".NET": dotnet,
};

/** Every registry entry, in the api's SDK list's order. */
export const registeredSdks: readonly SdkEntry[] = sdks.map(
  (sdk) => sdkRegistry[sdk],
);
