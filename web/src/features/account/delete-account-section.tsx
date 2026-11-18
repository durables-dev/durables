import { useId, useRef } from "react";
import { DeleteAccountDialog } from "./delete-account-dialog";
import styles from "./delete-account-section.module.css";

export interface DeleteAccountSectionProps {
  handle: string;
  /** How many of the owner's activities are in search. */
  listedCount: number;
  /** Runs once the account is deleted. */
  onDeleted: () => void;
}

// The red-bordered Delete your account box at the foot of the profile, and the dialog its
// button opens. The dialog is a native <dialog> opened with showModal(). However it closes
// without deleting, focus goes back to Delete account.
export function DeleteAccountSection({
  handle,
  listedCount,
  onDeleted,
}: DeleteAccountSectionProps) {
  const headingId = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <section aria-labelledby={headingId} className={styles["section"]}>
      <div className={styles["text"]}>
        <h2 id={headingId} className={styles["heading"]}>
          Delete your account
        </h2>
        <p className={styles["note"]}>
          Your activities leave search. You can restore your account by signing
          in within 30 days. After that your provider details are deleted and
          your handle is retired for good.
        </p>
      </div>
      <button
        ref={opener}
        type="button"
        className={styles["open"]}
        onClick={() => {
          dialog.current?.showModal();
        }}
      >
        Delete account
      </button>
      <DeleteAccountDialog
        dialogRef={dialog}
        handle={handle}
        listedCount={listedCount}
        onClose={() => {
          opener.current?.focus();
        }}
        onDeleted={onDeleted}
      />
    </section>
  );
}
