import { sdks } from "@durables/schemas";
import { dotnet } from "./dotnet";
import { python } from "./python";
import type { SdkEntry, SdkRegistry } from "./sdk-entry";
import { typescript } from "./typescript";

// The SDK registry (ADR 0013): every SDK's specifics, in one place in the api. Adding an SDK
// is one entry here and its name in the shared SDK list.

export const sdkRegistry: SdkRegistry = {
  Python: python,
  TypeScript: typescript,
  ".NET": dotnet,
};

/** Every registry entry, in the shared SDK list's order. */
export const registeredSdks: readonly SdkEntry[] = sdks.map(
  (sdk) => sdkRegistry[sdk],
);
