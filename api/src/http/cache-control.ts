// The Cache-Control values the API answers with (ADR 0006, api/CONVENTIONS.md).

/** A version endpoint: its fields never change, so the edge and the browser keep it for good. */
export const versionCacheControl = "public, max-age=31536000, immutable";

/** A listing endpoint: the edge keeps it briefly and the browser always revalidates. */
export const listingCacheControl = "public, max-age=0, s-maxage=60";

/** The Cache API store that version responses are kept in. */
export const versionCacheName = "versions";
