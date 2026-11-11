import type { Facts } from "../checks/facts";

// The version document (ADR 0005): one R2 object per published version, written once and
// never changed. It holds what the version was published with. The listing's current
// description lives in D1, because it can change after publishing (ADR 0006).

/** Where a published version lives: handle/name@version. */
export interface Address {
  handle: string;
  name: string;
  version: string;
}

/** One generated Implement snippet (ADR 0008). */
export interface Snippet {
  /** What the snippet is for, as the Activity page labels it. */
  readonly label: string;
  /** The snippet's code, exactly as generated. */
  readonly code: string;
}

/** Everything one published version is stored with. */
export interface VersionDocument {
  /** The code exactly as pasted, byte for byte. */
  readonly code: string;
  /** The facts the publish-time checks detected, SDK included. */
  readonly facts: Facts;
  /** The integrations implied by the code's imports. Empty when there are none. */
  readonly integrations: readonly string[];
  /** The Implement snippets generated at publish. */
  readonly snippets: readonly Snippet[];
  readonly title: string;
  /** The one-line description as it was when published. */
  readonly description: string;
}

/** The outcome of writing a version document. A key can be written once. */
export type WriteVersionDocumentResult =
  { outcome: "created" } | { outcome: "already-exists" };

/**
 * The document store refused or failed a write for a reason other than the key existing.
 * The message names the key only, never the document, which holds the published code.
 */
export class DocumentWriteFailure extends Error {
  readonly key: string;

  constructor(key: string, cause: unknown) {
    super(`Writing the version document at ${key} failed`, { cause });
    this.name = "DocumentWriteFailure";
    this.key = key;
  }
}

/**
 * The document key for an address: `versions/<handle>/<name>@<version>.json`. Each part is
 * percent-encoded, so no two addresses share a key.
 */
export const versionDocumentKey = ({ handle, name, version }: Address) =>
  `versions/${encodeURIComponent(handle)}/${encodeURIComponent(name)}@${encodeURIComponent(version)}.json`;
