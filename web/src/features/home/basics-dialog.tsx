import { useId, type ReactNode, type RefObject } from "react";
import styles from "./basics-dialog.module.css";

export interface BasicsDialogProps {
  /** The <dialog> element, which the home page opens with showModal(). */
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Runs however the dialog closed: the close button or Escape. */
  onClose: () => void;
  title: string;
  /** Where the Temporal docs explain this. */
  docsHref: string;
  /** The docs button's wording. */
  docsLabel: string;
  /** The explanation, as paragraphs. */
  children: ReactNode;
}

// One of the home page's short explanations (capability row 5): the heading, a few paragraphs
// and a link to Temporal's own docs, in a native <dialog>.
export function BasicsDialog({
  dialogRef,
  onClose,
  title,
  docsHref,
  docsLabel,
  children,
}: BasicsDialogProps) {
  const titleId = useId();

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles["dialog"]}
      onClose={onClose}
    >
      <div className={styles["header"]}>
        <h2 id={titleId} className={styles["title"]}>
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close"
          className={styles["close"]}
          onClick={() => {
            dialogRef.current?.close();
          }}
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
      <div className={styles["body"]}>{children}</div>
      <div className={styles["actions"]}>
        <a
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          className={styles["docs"]}
        >
          {docsLabel}
        </a>
      </div>
    </dialog>
  );
}
