import { findAccount } from "../db/accounts-repository.js";
import { insertOwnership } from "../db/ownership-repository.js";
import {
  formatActivityAddress,
  formatGroupAddress,
  isAddressSegment,
  parseActivityAddress,
  type ActivityAddress,
} from "../domain/addresses/address.js";
import { toSnakeCase } from "../domain/addresses/names.js";
import {
  parseGroupSource,
  renderGroupFile,
  type GroupSegment,
  type Publisher,
  type RenderedGroup,
  type Resolution,
} from "../domain/groups/group-file.js";
import { FIRST_VERSION, highestVersion } from "../domain/versioning/semver.js";
import type { Account } from "../model/account.js";
import type {
  GroupListing,
  GroupSdk,
  GroupVersion,
  PublishGroupRequest,
  PublishGroupResult,
  ResolvedGroup,
  ResolveGroupRequest,
} from "../model/group-version.js";
import { VersionExistsError } from "../storage/document-store.js";
import { currentAccount } from "./accounts.js";
import { documents } from "./documents.js";
import { BadRequestError, ServiceError } from "./errors.js";

type Headers = Record<string, string | string[] | undefined>;

// Error handling beyond the demo path is faked for groups: request bodies are
// not validated (a missing or malformed body fails as a raw 500), and a stored
// group whose member no longer resolves throws rather than answering 4xx.
/**
 * Step 6: resolves the group editor's full text. Always answers with the file
 * the editor shows next; anything wrong is a problem inside it, not an error.
 */
// POC-SHORTCUT: SC-013
export async function resolveGroup(headers: Headers, request: ResolveGroupRequest): Promise<ResolvedGroup> {
  const owner = signedIn(headers);
  const { strayLines: _strayLines, ...resolved } = await resolveSource(owner, checkSdk(request.sdk), request.source ?? "");
  return resolved;
}

/**
 * Step 7: publishes the editor's text as the first version of a group.
 * Resolution is re-run here, so nothing stored comes from the client's own
 * result. The document holds only the metadata and the pinned member addresses.
 */
export async function publishGroup(headers: Headers, request: PublishGroupRequest): Promise<PublishGroupResult> {
  const owner = signedIn(headers);
  const sdk = checkSdk(request.sdk);
  const name = (request.name ?? "").trim();
  if (!isAddressSegment(name)) {
    throw new BadRequestError("The group name must be lowercase kebab-case, like payments.");
  }

  const resolved = await resolveSource(owner, sdk, request.source ?? "");
  if (resolved.problems.length > 0) {
    throw new BadRequestError("Fix the problems flagged in the editor before publishing.", { problems: resolved.problems });
  }
  if (resolved.members.length === 0) {
    throw new BadRequestError("The group has no members. Paste an activity address to add one.");
  }
  if (resolved.strayLines.length > 0) {
    const lines = resolved.strayLines.join(", ");
    throw new BadRequestError(`Line ${lines} ${resolved.strayLines.length > 1 ? "are" : "is"} neither a resolved block nor an activity address.`);
  }

  const version = FIRST_VERSION;
  if ((await documents().listGroupVersions(owner.handle, name)).length > 0) {
    throw new ServiceError(409, `${formatGroupAddress(owner.handle, name)} is already published.`);
  }

  const doc: GroupVersion = {
    owner: owner.handle,
    name,
    version,
    publishedAt: new Date().toISOString(),
    sdk,
    members: resolved.members.map((member) => member.address),
  };

  // Consistency between stores is faked: the group document is written first,
  // then the ownership row, with no transaction. If the row fails, the document stays.
  // POC-SHORTCUT: SC-012
  try {
    await documents().putGroupVersion(doc);
  } catch (error) {
    if (error instanceof VersionExistsError) throw new ServiceError(409, error.message);
    throw error;
  }
  await insertOwnership(owner.handle, "group", name);

  return { address: formatGroupAddress(owner.handle, name, version), owner: owner.handle, name, version };
}

/** Step 7: the group listing, with its file regenerated from the pinned members. */
export async function getGroupListing(owner: string, name: string, version?: string): Promise<GroupListing> {
  const resolvedVersion = version ?? highestVersion(await documents().listGroupVersions(owner, name));
  const doc = resolvedVersion ? await documents().getGroupVersion(owner, name, resolvedVersion) : null;
  if (!doc) throw new ServiceError(404, `${formatGroupAddress(owner, name, version)} is not published.`);

  // Each pinned member is laid out as if freshly pasted, so the listing's file
  // has the canonical spacing whatever the editor held at publish.
  const segments: GroupSegment[] = doc.members.map((address) => {
    const parsed = parseActivityAddress(address);
    if (!parsed?.version) throw new Error(`Group ${doc.owner}/${doc.name}@${doc.version} has an unpinned member ${address}`);
    return { kind: "address", address: parsed, text: address };
  });
  const rendered = renderGroupFile(doc.sdk, segments, await resolveSegments(doc.owner, doc.sdk, segments));
  if (rendered.members.length !== doc.members.length) {
    throw new Error(`Group ${doc.owner}/${doc.name}@${doc.version} has a member that no longer resolves`);
  }

  return {
    address: formatGroupAddress(doc.owner, doc.name, doc.version),
    owner: doc.owner,
    name: doc.name,
    version: doc.version,
    publishedAt: doc.publishedAt,
    publisher: await publisherFor(doc.owner),
    sdk: doc.sdk,
    filename: `${toSnakeCase(doc.name)}.py`,
    file: rendered.file,
    members: rendered.members.map(({ address, owner: memberOwner, name: memberName, version: memberVersion }) => ({
      address,
      owner: memberOwner,
      name: memberName,
      version: memberVersion,
    })),
  };
}

function signedIn(headers: Headers): Account {
  const account = currentAccount(headers);
  if (!account) throw new ServiceError(401, "Unknown user");
  return account;
}

// Groups stay Python-only, even though listings now come in three SDKs (POC-8).
function checkSdk(sdk: unknown): GroupSdk {
  if (sdk !== "python") throw new BadRequestError("Only Python groups can be built.");
  return sdk;
}

async function resolveSource(owner: Account, sdk: GroupSdk, source: string): Promise<RenderedGroup> {
  const segments = parseGroupSource(source);
  return renderGroupFile(sdk, segments, await resolveSegments(owner.handle, sdk, segments));
}

async function resolveSegments(ownerHandle: string, sdk: GroupSdk, segments: GroupSegment[]): Promise<(Resolution | undefined)[]> {
  const publishers = new Map<string, Promise<Publisher>>();
  const publisher = (handle: string) => {
    if (!publishers.has(handle)) publishers.set(handle, publisherFor(handle));
    return publishers.get(handle)!;
  };
  return Promise.all(
    segments.map((segment) =>
      segment.kind === "address" || segment.kind === "block"
        ? resolveAddress(segment.address, ownerHandle, sdk, publisher)
        : undefined,
    ),
  );
}

/**
 * An address without a version pins the latest (the highest stored version).
 * A pinned address must exist at exactly that version.
 */
async function resolveAddress(
  address: ActivityAddress,
  ownerHandle: string,
  sdk: GroupSdk,
  publisher: (handle: string) => Promise<Publisher>,
): Promise<Resolution> {
  const shown = formatActivityAddress(address.owner, address.name, address.version);
  const version = address.version ?? highestVersion(await documents().listActivityVersions(address.owner, address.name));
  const doc = version ? await documents().getActivityVersion(address.owner, address.name, version) : null;
  if (!doc) {
    return { ok: false, kind: "unknown-address", message: `${shown} is not a published activity.` };
  }
  if (doc.owner !== ownerHandle) {
    return {
      ok: false,
      kind: "other-publisher",
      message: `${shown} belongs to ${doc.owner}. A group can only hold your own activities.`,
    };
  }
  if (doc.sdk !== sdk) {
    return { ok: false, kind: "wrong-sdk", message: `${shown} is a ${doc.sdk} activity. This group is ${sdk}.` };
  }
  return { ok: true, doc, publisher: await publisher(doc.owner) };
}

async function publisherFor(handle: string): Promise<Publisher> {
  const account = await findAccount(handle);
  return account
    ? { handle: account.handle, displayName: account.displayName, verified: account.verified }
    : { handle, displayName: handle, verified: false };
}
