import { useId, useState, type RefObject } from "react";
import type { ListingAddress } from "./listing-address";
import styles from "./update-dialog.module.css";
import { UpdateForm } from "./update-form";

export interface UpdateDialogProps {
  /** The <dialog> element, which the publisher bar opens with showModal(). */
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Runs however the dialog closed: Cancel, the close button, Escape, or a save. */
  onClose: () => void;
  address: ListingAddress;
  /** The listing's saved description. */
  description: string;
}

// "Update listing": the heading, the intro, then the description field, the note on what
// can't be changed here and the buttons. Cancel, the close button and Escape all close it
// without saving. Each close starts the form afresh, so the next opening shows the saved
// description rather than an abandoned edit.
export function UpdateDialog({
  dialogRef,
  onClose,
  address,
  description,
}: UpdateDialogProps) {
  const titleId = useId();
  const introId = useId();
  const [opening, setOpening] = useState(0);

  function close() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={introId}
      className={styles["dialog"]}
      onClose={() => {
        setOpening((count) => count + 1);
        onClose();
      }}
    >
      <div className={styles["header"]}>
        <h2 id={titleId} className={styles["title"]}>
          Update listing
        </h2>
        <button
          type="button"
          aria-label="Close"
          className={styles["close"]}
          onClick={close}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <p id={introId} className={styles["intro"]}>
        This changes on every version&apos;s page right away. Anything about how
        the activity behaves needs a new version instead.
      </p>
      <UpdateForm
        key={opening}
        address={address}
        description={description}
        onCancel={close}
        onSaved={close}
      />
    </dialog>
  );
}
