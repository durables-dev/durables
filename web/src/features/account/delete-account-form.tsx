import { startTransition, useActionState, useId, useState } from "react";
import { confirmsHandle } from "./delete-account-text";
import styles from "./delete-account-form.module.css";
import { useDeleteAccount } from "./use-delete-account";

export interface DeleteAccountFormProps {
  /** The owner's handle, which must be typed exactly to confirm. */
  handle: string;
  /** Closes the dialog without deleting. */
  onCancel: () => void;
  /** Runs once the account is deleted. */
  onDeleted: () => void;
}

/** Where the latest press of Delete account got to. */
type DeleteOutcome =
  { kind: "idle" } | { kind: "failed" } | { kind: "deleted" };

/** Shown above the buttons when the delete request fails, for any reason. */
export const deleteFailedMessage = "Deleting didn't finish. Try again.";

// The confirmation field and the buttons of the Delete your account dialog. Delete account
// stays disabled until the field holds the handle exactly. A failed delete keeps the dialog
// open with what was typed and says so.
//
// The form submits through `onSubmit` rather than the `action` prop. React resets a form after
// its `action` returns, which would empty the field after a failed delete.
export function DeleteAccountForm({
  handle,
  onCancel,
  onDeleted,
}: DeleteAccountFormProps) {
  const deleteAccount = useDeleteAccount();
  const fieldId = useId();
  const [typed, setTyped] = useState("");

  const [outcome, deleteAction, isDeleting] = useActionState<
    DeleteOutcome,
    FormData
  >(
    async (previous: DeleteOutcome, form: FormData): Promise<DeleteOutcome> => {
      // A press queued behind one that deleted does nothing.
      if (previous.kind === "deleted") return previous;
      const value = form.get("handle");
      const confirmation = typeof value === "string" ? value : "";
      if (!confirmsHandle(confirmation, handle)) return previous;
      try {
        await deleteAccount.mutateAsync(confirmation);
      } catch {
        return { kind: "failed" };
      }
      onDeleted();
      return { kind: "deleted" };
    },
    { kind: "idle" },
  );

  return (
    <form
      className={styles["form"]}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => {
          deleteAction(form);
        });
      }}
    >
      <div className={styles["field"]}>
        <label htmlFor={fieldId} className={styles["label"]}>
          Type your handle to confirm
        </label>
        <input
          id={fieldId}
          name="handle"
          type="text"
          defaultValue=""
          onChange={(event) => {
            setTyped(event.currentTarget.value);
          }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className={styles["input"]}
        />
      </div>
      {outcome.kind === "failed" && !isDeleting ? (
        <p role="alert" className={styles["failed"]}>
          {deleteFailedMessage}
        </p>
      ) : null}
      <div className={styles["actions"]}>
        <button type="button" className={styles["cancel"]} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles["delete"]}
          disabled={!confirmsHandle(typed, handle) || isDeleting}
        >
          {isDeleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </form>
  );
}
