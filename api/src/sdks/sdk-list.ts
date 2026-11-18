import { z } from "zod";

// The api's SDK list (ADR 0013). The SDK registry is keyed by it, so a name added here without
// a registry entry does not compile. Web imports no SDK list or type: it receives SDK names in
// api responses and from the SDK catalog.

/**
 * The Temporal SDKs Durables accepts activities from, named as listings store them, in
 * Temporal's order.
 */
export const sdks = [
  "Go",
  "Java",
  "Python",
  "TypeScript",
  ".NET",
  "Ruby",
  "PHP",
  "Rust",
] as const;

export const sdkSchema = z.enum(sdks);

export type Sdk = z.infer<typeof sdkSchema>;
