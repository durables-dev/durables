import { useRef } from "react";
import styles from "./publisher-bar.module.css";
import { UpdateDialog } from "./update-dialog";

// The bar above the section bar that only the listing's publisher sees, and the Update dialog
// it opens. The dialog is a native <dialog> opened with showModal(), as the contribute flow's
// published-code dialog is. However it closes, focus goes back to Update.
export function PublisherBar() {
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <section aria-label="Your listing controls" className={styles["bar"]}>
      <p className={styles["note"]}>
        <span className={styles["lead"]}>You published this activity.</span>{" "}
        <span className={styles["muted"]}>Only you see these controls.</span>
      </p>
      <button
        ref={opener}
        type="button"
        className={styles["update"]}
        onClick={() => {
          dialog.current?.showModal();
        }}
      >
        Update
      </button>
      <UpdateDialog
        dialogRef={dialog}
        onClose={() => {
          opener.current?.focus();
        }}
      />
    </section>
  );
}
