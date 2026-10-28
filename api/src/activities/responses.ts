import type { Facts } from "../checks/facts";
import type {
  Address,
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
}

/** A listing, as `GET /api/activities/:handle/:name` answers it. */
export interface ListingResponse {
  handle: string;
  name: string;
  /** The current one-line description. */
  description: string;
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
 * The version response, from the version's row and its document. The document's description
 * is the one it was published with and is left out, since the listing's can change.
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
});

/** The listing response, from the listing's current description. */
export const listingResponse = ({
  handle,
  name,
  description,
}: ListingDescription): ListingResponse => ({ handle, name, description });
