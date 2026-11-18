import { useRef } from "react";
import { BarDialog } from "./bar-dialog";
import { changeFailedMessage, changeRefusal } from "./change-refusal";
import { DeprecateForm } from "./deprecate-form";
import type { ListingAddress } from "./listing-address";
import { NewVersionForm } from "./new-version-form";
import type { ListingResponse } from "@/lib/listing-queries";
import styles from "./publisher-bar.module.css";
import { RemoveForm } from "./remove-form";
import { SignInEnded } from "./sign-in-ended";
import { UpdateDialog } from "./update-dialog";
import { useReturnToSearch, useUndoDeprecation } from "./use-listing-changes";

// The bar above the section bar that only the listing's publisher sees, and the dialogs it
// opens. Each dialog is a native <dialog> opened with showModal(). However it closes, focus goes
// back to the button that opened it. Deprecate and Undo deprecation are one button whose label
// follows the version's state, as are Remove and Return to search, so focus stays on it when
// the state changes. While one of those is saving it is aria-disabled rather than disabled, so
// it keeps focus. Undo deprecation and Return to search act at once, with no confirmation.
export interface PublisherBarProps {
  address: ListingAddress;
  /** The viewed version's saved description, which the Update dialog's field starts with. */
  description: string;
  /** The listing as last read: its removal from search and each version's deprecation. */
  listing: ListingResponse;
}

export function PublisherBar({
  address,
  description,
  listing,
}: PublisherBarProps) {
  const updateOpener = useRef<HTMLButtonElement>(null);
  const updateDialog = useRef<HTMLDialogElement>(null);
  const deprecationButton = useRef<HTMLButtonElement>(null);
  const deprecateDialog = useRef<HTMLDialogElement>(null);
  const removalButton = useRef<HTMLButtonElement>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);
  const newVersionButton = useRef<HTMLButtonElement>(null);
  const newVersionDialog = useRef<HTMLDialogElement>(null);
  const undo = useUndoDeprecation(address);
  const returnToSearch = useReturnToSearch(address);

  const versions = listing.versions.map(({ version }) => version);
  const deprecated =
    listing.versions.find(({ version }) => version === address.version)
      ?.deprecation != null;
  const removed = listing.removedBy !== null;

  // The bar shows the latest of its own actions to fail, until another is tried.
  const failure = [undo, returnToSearch].find(
    (change) => change.isError && !change.isPending,
  );
  const refusal =
    failure === undefined ? undefined : changeRefusal(failure.error);

  function closeDeprecate() {
    deprecateDialog.current?.close();
  }

  function closeRemove() {
    removeDialog.current?.close();
  }

  function clearFailures() {
    undo.reset();
    returnToSearch.reset();
  }

  return (
    <section aria-label="Your listing controls" className={styles["bar"]}>
      <p className={styles["note"]}>
        <span className={styles["lead"]}>You published this activity.</span>{" "}
        <span className={styles["muted"]}>
          {removed
            ? "It's hidden from search."
            : "Only you see these controls."}
        </span>
      </p>
      <div className={styles["actions"]}>
        <button
          ref={updateOpener}
          type="button"
          className={styles["action"]}
          onClick={() => {
            clearFailures();
            updateDialog.current?.showModal();
          }}
        >
          Update
        </button>
        <button
          ref={deprecationButton}
          type="button"
          className={styles["action"]}
          aria-disabled={undo.isPending}
          onClick={() => {
            if (undo.isPending) return;
            clearFailures();
            if (deprecated) {
              undo.mutate();
            } else {
              deprecateDialog.current?.showModal();
            }
          }}
        >
          {deprecated ? "Undo deprecation" : `Deprecate ${address.version}`}
        </button>
        <button
          ref={newVersionButton}
          type="button"
          className={styles["action"]}
          onClick={() => {
            clearFailures();
            newVersionDialog.current?.showModal();
          }}
        >
          Create new version
        </button>
        <button
          ref={removalButton}
          type="button"
          className={
            removed
              ? styles["action"]
              : `${styles["action"]} ${styles["danger"]}`
          }
          aria-disabled={returnToSearch.isPending}
          onClick={() => {
            if (returnToSearch.isPending) return;
            clearFailures();
            if (removed) {
              returnToSearch.mutate();
            } else {
              removeDialog.current?.showModal();
            }
          }}
        >
          {removed ? "Return to search" : "Remove"}
        </button>
      </div>
      {refusal?.kind === "signInEnded" ? (
        <SignInEnded then="try again" />
      ) : refusal === undefined ? null : (
        <p role="alert" className={styles["failed"]}>
          {changeFailedMessage}
        </p>
      )}
      <UpdateDialog
        dialogRef={updateDialog}
        address={address}
        description={description}
        onClose={() => {
          updateOpener.current?.focus();
        }}
      />
      <BarDialog
        dialogRef={deprecateDialog}
        title={
          <>
            Deprecate{" "}
            <span className={styles["version"]}>{address.version}</span>
          </>
        }
        intro="The version stays available at its address and doesn't change. Its page shows your notice."
        onClose={() => {
          deprecationButton.current?.focus();
        }}
      >
        <DeprecateForm
          address={address}
          versions={versions}
          onCancel={closeDeprecate}
          onSaved={closeDeprecate}
        />
      </BarDialog>
      <BarDialog
        dialogRef={removeDialog}
        title="Remove from search?"
        intro={
          <>
            Removing{" "}
            <span className={styles["address"]}>
              {address.handle}/{address.name}
            </span>{" "}
            takes every version out of search.
          </>
        }
        onClose={() => {
          removalButton.current?.focus();
        }}
      >
        <RemoveForm
          address={address}
          onCancel={closeRemove}
          onSaved={closeRemove}
        />
      </BarDialog>
      <BarDialog
        dialogRef={newVersionDialog}
        title="Create a new version"
        intro="Choose the version to start from. Its title and description are filled in for you. The code starts blank, and its behavior is detected again."
        onClose={() => {
          newVersionButton.current?.focus();
        }}
      >
        <NewVersionForm
          address={address}
          versions={listing.versions}
          onCancel={() => {
            newVersionDialog.current?.close();
          }}
        />
      </BarDialog>
    </section>
  );
}
