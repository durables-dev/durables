import { useId, type ReactNode, type RefObject } from "react";
import styles from "./update-dialog.module.css";

export interface UpdateDialogProps {
  /** The <dialog> element, which the publisher bar opens with showModal(). */
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Runs however the dialog closed: Cancel, the close button, or Escape. */
  onClose: () => void;
  /** The one-line description field, between the intro and the note. */
  children?: ReactNode;
}

// "Update listing": the heading, the intro, the description field, and the note on what can't
// be changed here. Cancel, the close button and Escape all close it without saving.
export function UpdateDialog({
  dialogRef,
  onClose,
  children,
}: UpdateDialogProps) {
  const titleId = useId();
  const introId = useId();

  function close() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={introId}
      className={styles["dialog"]}
      onClose={onClose}
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
      {children}
      <p className={styles["fixed"]}>
        Can&apos;t change here: the code, its detected facts and its address.
        Those are fixed when a version is published.
      </p>
      <div className={styles["actions"]}>
        <button type="button" className={styles["cancel"]} onClick={close}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
