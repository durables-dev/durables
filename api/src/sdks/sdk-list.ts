import { z } from "zod";

// The api's SDK list (ADR 0013). The SDK registry is keyed by it, so a name added here without
// a registry entry does not compile. Web imports no SDK list or type: it receives SDK names in
// api responses and from the SDK catalog.

/** The Temporal SDKs Durables accepts activities from, named as listings store them. */
export const sdks = ["Python", "TypeScript", ".NET", "Rust"] as const;

export const sdkSchema = z.enum(sdks);

export type Sdk = z.infer<typeof sdkSchema>;
