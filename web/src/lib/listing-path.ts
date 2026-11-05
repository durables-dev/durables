/** Where a published version lives: its publisher's handle, its name and its version. */
export interface ListingPathParts {
  handle: string;
  name: string;
  version: string;
}

/**
 * The site path of a version's Activity page: /handle/name@version, such as
 * /ddieruf/charge-card@1.0.0. Each part is percent-encoded.
 */
export function listingPath({
  handle,
  name,
  version,
}: ListingPathParts): string {
  return `/${encodeURIComponent(handle)}/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}
