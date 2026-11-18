import { useId, useState, type RefObject } from "react";
import styles from "./delete-account-dialog.module.css";
import { DeleteAccountForm } from "./delete-account-form";
import { listedActivitiesLeaveSearch } from "./delete-account-text";

export interface DeleteAccountDialogProps {
  /** The <dialog> element, which the Delete section opens with showModal(). */
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Runs however the dialog closed without deleting: Cancel or Escape. */
  onClose: () => void;
  /** Runs once the account is deleted. */
  onDeleted: () => void;
  handle: string;
  /** How many of the owner's activities are in search. */
  listedCount: number;
}

// "Delete your account?": what deleting does, the confirmation field and the buttons. Cancel
// and Escape close it without deleting. Each close starts the form afresh, so the next opening
// shows an empty field.
export function DeleteAccountDialog({
  dialogRef,
  onClose,
  onDeleted,
  handle,
  listedCount,
}: DeleteAccountDialogProps) {
  const titleId = useId();
  const [opening, setOpening] = useState(0);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles["dialog"]}
      onClose={() => {
        setOpening((count) => count + 1);
        onClose();
      }}
    >
      <h2 id={titleId} className={styles["title"]}>
        Delete your account?
      </h2>
      <ul className={styles["bullets"]}>
        <li>{listedActivitiesLeaveSearch(listedCount)}</li>
        <li>Their pages and addresses keep working, marked removed.</li>
        <li>
          You can restore everything by signing in with the same account within
          30 days.
        </li>
        <li>
          After 30 days your sign-in details are deleted and the handle{" "}
          <span className={styles["handle"]}>{handle}</span> is retired for
          good.
        </li>
      </ul>
      <DeleteAccountForm
        key={opening}
        handle={handle}
        onCancel={() => {
          dialogRef.current?.close();
        }}
        onDeleted={onDeleted}
      />
    </dialog>
  );
}
