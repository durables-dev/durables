import type { UnacceptedSdk } from "./facts";
import type { Recognisable } from "./identify";

// The Temporal SDKs Durables recognises but does not accept, so a refusal can name the SDK the
// file is written in. Every SDK Temporal officially supports is now accepted, so none is left.
// DUR-89 retires this list and the refusal that reads it.

/**
 * The SDKs Durables recognises but does not accept. Identification runs over these with the
 * registry's SDKs, so a refusal can name the SDK.
 */
export const unacceptedSdks: readonly Recognisable<UnacceptedSdk>[] = [];
