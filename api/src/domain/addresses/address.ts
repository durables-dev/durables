// Durables activity addresses: durables.dev/<owner>/<name>, with an optional @<version>.

const ACTIVITY_ADDRESS = /^durables\.dev\/([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:@(\d+\.\d+\.\d+))?$/;
const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const VERSION = /^\d+\.\d+\.\d+$/;

export type ActivityAddress = { owner: string; name: string; version?: string };

export function isActivityAddress(address: string): boolean {
  return ACTIVITY_ADDRESS.test(address.trim());
}

/** Parses `durables.dev/<owner>/<name>[@<version>]`. Returns null if it isn't one. */
export function parseActivityAddress(address: string): ActivityAddress | null {
  const match = ACTIVITY_ADDRESS.exec(address.trim());
  if (!match) return null;
  return { owner: match[1], name: match[2], ...(match[3] ? { version: match[3] } : {}) };
}

export function formatActivityAddress(owner: string, name: string, version?: string): string {
  return `durables.dev/${owner}/${name}${version ? `@${version}` : ""}`;
}

/** True for an owner or listing name that can appear in an address (lowercase kebab-case). */
export function isAddressSegment(text: string): boolean {
  return SEGMENT.test(text);
}

export function isVersion(text: string): boolean {
  return VERSION.test(text);
}

/** A group address: `durables.dev/<owner>/groups/<name>`, with an optional `@<version>`. */
export function formatGroupAddress(owner: string, name: string, version?: string): string {
  return `durables.dev/${owner}/groups/${name}${version ? `@${version}` : ""}`;
}
