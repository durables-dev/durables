import type { Facts } from "../checks/facts";
import { activityFileName } from "../snippets/labels";
import type {
  Snippet,
  Address,
  Listing,
  ListingDescription,
  Sdk,
  Version,
  VersionDocument,
} from "../storage/storage";

// What the activities resource answers with. A version response holds only fields that can
// never change, because it is cached for good (ADR 0006). The description can change, so it
// is answered by the listing response alone.

/** A published version, as `GET /api/activities/:handle/:name/versions/:version` answers it. */
export interface VersionResponse extends Address {
  /** The full address: `handle/name@version`. */
  address: string;
  title: string;
  sdk: Sdk;
  /** The facts the publish-time checks detected. */
  facts: Facts;
  /** The code exactly as published, byte for byte. Never reindented. */
  code: string;
  /** The file the published code is saved as, which names the Implement activity file. */
  activityFileName: string;
  /**
   * The Implement snippets generated at publish, in the order the Activity page shows them:
   * the install command, the workflow, worker and starter files, then the run commands.
   */
  snippets: readonly Snippet[];
  /** The integrations implied by the code's imports. Empty when there are none. */
  integrations: readonly string[];
  /** When the version was published, as an ISO 8601 timestamp. */
  publishedAt: string;
}

/** A listing, as `GET /api/activities/:handle/:name` answers it. */
export interface ListingResponse {
  handle: string;
  name: string;
  /** The current one-line description. */
  description: string;
}

/** One browse result: a listing, shown at its highest version number. */
export interface ActivityCard extends Address {
  /** The full address of the version on the card: `handle/name@version`. */
  address: string;
  title: string;
  sdk: Sdk;
  /** The listing's current one-line description. */
  description: string;
  /** The integrations of the version on the card. Empty when there are none. */
  integrations: string[];
  /** When the version on the card was published, as an ISO 8601 timestamp. */
  publishedAt: string;
}

/** The order browse results are in: relevance when there are words, newest first otherwise. */
export type BrowseSort = "newest" | "relevance";

/** A batch of browse results, as `GET /api/activities` answers it. */
export interface BrowseResponse {
  /** Up to 50 cards, in the order of the sort. */
  activities: ActivityCard[];
  /** How many listings match in all, not only in this batch. */
  count: number;
  sort: BrowseSort;
  /** Send this back as the cursor for the next batch. Null after the last batch. */
  nextCursor: string | null;
}

/** A new version, as `POST /api/activities` answers a publish with 201. */
export interface PublishResponse extends Address {
  /** The full address: `handle/name@version`. */
  address: string;
  /** The version's API path, the same as the response's `Location` header. */
  location: string;
  /** True when this publish created the publisher's Durables account. */
  accountCreated: boolean;
}

/** The address as the site shows it: `handle/name@version`. */
export const formatAddress = ({ handle, name, version }: Address) =>
  `${handle}/${name}@${version}`;

/** The API path a version is read at. Each part is percent-encoded. */
export const versionLocation = ({ handle, name, version }: Address) =>
  `/api/activities/${encodeURIComponent(handle)}/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`;

/** The publish response, from the address published and whether the account was created. */
export const publishResponse = (
  { handle, name, version }: Address,
  accountCreated: boolean,
): PublishResponse => ({
  address: formatAddress({ handle, name, version }),
  handle,
  name,
  version,
  location: versionLocation({ handle, name, version }),
  accountCreated,
});

/**
 * The version response, from the version's row and its document. Every field is fixed at
 * publish. The document's description is the one it was published with and is left out,
 * since the listing's can change.
 */
export const versionResponse = (
  version: Version,
  document: VersionDocument,
): VersionResponse => ({
  address: formatAddress(version),
  handle: version.handle,
  name: version.name,
  version: version.version,
  title: version.title,
  sdk: version.sdk,
  facts: document.facts,
  code: document.code,
  activityFileName: activityFileName[version.sdk],
  snippets: document.snippets,
  integrations: document.integrations,
  publishedAt: version.publishedAt.toISOString(),
});

/** The listing response, from the listing's current description. */
export const listingResponse = ({
  handle,
  name,
  description,
}: ListingDescription): ListingResponse => ({ handle, name, description });

/** A browse card, from the listing at its highest version. */
export const activityCard = ({
  handle,
  name,
  version,
  title,
  sdk,
  description,
  integrations,
  publishedAt,
}: Listing): ActivityCard => ({
  address: formatAddress({ handle, name, version }),
  handle,
  name,
  version,
  title,
  sdk,
  description,
  integrations,
  publishedAt: publishedAt.toISOString(),
});
