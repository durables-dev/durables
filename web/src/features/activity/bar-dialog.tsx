import {
  Fragment,
  useId,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import styles from "./bar-dialog.module.css";

export interface BarDialogProps {
  /** The <dialog> element, which the publisher bar opens with showModal(). */
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Runs however the dialog closed: Cancel, the close button, Escape, or a save. */
  onClose: () => void;
  title: ReactNode;
  /** The text under the title, which describes the dialog. */
  intro: ReactNode;
  /** The dialog's form. It starts afresh each time the dialog opens. */
  children: ReactNode;
}

// The shell of a dialog the publisher bar opens: a native <dialog>, its title, a close button
// and its intro, then the form. Cancel, the close button and Escape all close it without
// saving.
export function BarDialog({
  dialogRef,
  onClose,
  title,
  intro,
  children,
}: BarDialogProps) {
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
          {title}
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
        {intro}
      </p>
      <Fragment key={opening}>{children}</Fragment>
    </dialog>
  );
}
