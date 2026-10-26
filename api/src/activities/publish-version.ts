import type {
  CreatePublicationResult,
  Listing,
  NewListing,
  ProviderIdentity,
  Storage,
  VersionDocument,
} from "../storage/storage";

// Writing a publication to both stores (ADR 0005, api/CONVENTIONS.md, Data access). The
// document is written first, create-only, then the database rows. A document counts only once
// its rows exist, so when the rows are not written the document is deleted right away. A
// document found with no rows is an orphan from an earlier failed publish: it is deleted and
// written again.

/** The storage methods publishing uses. */
export type PublishStorage = Pick<
  Storage,
  | "findVersion"
  | "isHandleAvailable"
  | "writeVersionDocument"
  | "deleteVersionDocument"
  | "createPublication"
>;

/** What one publish writes. */
export interface Publication {
  /** The listing and its first version, at the address being published. */
  listing: NewListing;
  /** The version document for the same address. */
  document: VersionDocument;
  /** The provider identity to create the account for. Absent when the account exists. */
  newAccount?: ProviderIdentity;
}

/**
 * The outcome of a publish. Published means both stores hold the version. Address-taken and
 * handle-taken mean nothing this publish wrote is left in either store.
 */
export type PublishOutcome =
  | { outcome: "published"; listing: Listing; accountCreated: boolean }
  | { outcome: "address-taken" }
  | { outcome: "handle-taken" };

/** Where a clean-up that failed is reported. Only the request ID and the error's name. */
export interface PublishContext {
  requestId: string;
}

/**
 * Deletes a document whose rows were not written. A failed delete leaves an orphan that is
 * never served and that the next publish at the address replaces, so it is logged, not raised.
 */
const cleanUp = async (
  storage: PublishStorage,
  listing: NewListing,
  { requestId }: PublishContext,
): Promise<void> => {
  try {
    await storage.deleteVersionDocument(listing);
  } catch (error) {
    console.warn({
      message: "Deleting an unpublished version document failed",
      requestId,
      error: { name: error instanceof Error ? error.name : typeof error },
    });
  }
};

/**
 * Writes the document create-only. A document already at the address with no version row is
 * an orphan, deleted and written again.
 *
 * @returns false when the address is published.
 */
const writeDocument = async (
  storage: PublishStorage,
  { listing, document }: Publication,
): Promise<boolean> => {
  const first = await storage.writeVersionDocument(listing, document);
  if (first.outcome === "created") {
    return true;
  }
  if ((await storage.findVersion(listing)) !== undefined) {
    return false;
  }
  await storage.deleteVersionDocument(listing);
  const second = await storage.writeVersionDocument(listing, document);
  if (second.outcome !== "created") {
    throw new Error("The orphaned version document could not be replaced.");
  }
  return true;
};

/**
 * Publishes a version: checks the address and handle are free, writes the document, then
 * writes the account when there is none, the listing and the version in one batch.
 *
 * @throws {DocumentWriteFailure} when the document store fails. Nothing is written to the
 * database.
 * @throws when the database fails. The document is deleted first.
 */
export const publishVersion = async (
  storage: PublishStorage,
  publication: Publication,
  context: PublishContext,
): Promise<PublishOutcome> => {
  const { listing, newAccount } = publication;
  // The database is read first, so a published address never reaches the document store. On a
  // first publish the handle is checked before the address: when another account owns the
  // handle, any version at the address is theirs, and the answer is handle-taken.
  if (
    newAccount !== undefined &&
    !(await storage.isHandleAvailable(listing.handle))
  ) {
    return { outcome: "handle-taken" };
  }
  if ((await storage.findVersion(listing)) !== undefined) {
    return { outcome: "address-taken" };
  }

  if (!(await writeDocument(storage, publication))) {
    return { outcome: "address-taken" };
  }

  let result: CreatePublicationResult;
  try {
    result = await storage.createPublication({
      listing,
      ...(newAccount === undefined ? {} : { newAccount }),
    });
  } catch (error) {
    await cleanUp(storage, listing, context);
    throw error;
  }
  if (result.outcome !== "created") {
    // When another publish of this address won, its document replaced ours in writeDocument.
    // That document is the only one behind its version, so it is left in place.
    if (
      result.outcome !== "address-taken" ||
      (await storage.findVersion(listing)) === undefined
    ) {
      await cleanUp(storage, listing, context);
    }
    return result;
  }
  return {
    outcome: "published",
    listing: result.listing,
    accountCreated: result.accountCreated,
  };
};
