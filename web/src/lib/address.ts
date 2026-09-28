// Durables addresses, in any of the forms web sees them:
//   durables.dev/<owner>/<name>@<version>   (a full address, e.g. a compensation link)
//   <owner>/<name>@<version>
//   <name>@<version>                        (the :nameAtVersion route segment)
// The version is optional everywhere: without it, the listing's default version opens.

export type ParsedAddress = { owner?: string; name: string; version?: string };

export function parseAddress(address: string): ParsedAddress {
  const parts = address.trim().replace(/^https?:\/\//, "").replace(/^durables\.dev\//, "").split("/");
  const last = parts.pop() ?? "";
  const at = last.lastIndexOf("@");
  const name = at === -1 ? last : last.slice(0, at);
  const version = at === -1 ? undefined : last.slice(at + 1) || undefined;
  const owner = parts.pop();
  return { ...(owner ? { owner } : {}), name, ...(version ? { version } : {}) };
}

/** The web path of a listing: /<owner>/<name>, or /<owner>/<name>@<version>. */
export function listingPath(owner: string, name: string, version?: string): string {
  return `/${owner}/${name}${version ? `@${version}` : ""}`;
}
