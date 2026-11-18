import { startTransition, useActionState } from "react";
import {
  changeFailedMessage,
  changeRefusal,
  type ChangeRefusal,
} from "./change-refusal";
import type { ListingAddress } from "./listing-address";
import styles from "./remove-form.module.css";
import { SignInEnded } from "./sign-in-ended";
import { useRemoveFromSearch } from "./use-listing-changes";

export interface RemoveFormProps {
  address: ListingAddress;
  /** Closes the dialog without removing. */
  onCancel: () => void;
  /** Closes the dialog once the activity is out of search. */
  onSaved: () => void;
}

/** Where the latest press of Remove from search got to. */
type RemoveOutcome = { kind: "idle" } | { kind: "saved" } | ChangeRefusal;

// The body of the Remove dialog: what removal keeps working, then Cancel and Remove from
// search. A refused removal keeps the dialog open.
export function RemoveForm({ address, onCancel, onSaved }: RemoveFormProps) {
  const remove = useRemoveFromSearch(address);

  const [outcome, removeAction, isSaving] = useActionState(
    async (previous: RemoveOutcome): Promise<RemoveOutcome> => {
      if (previous.kind === "saved") return previous;
      try {
        await remove.mutateAsync();
        onSaved();
        return { kind: "saved" };
      } catch (error) {
        return changeRefusal(error);
      }
    },
    { kind: "idle" },
  );

  return (
    <form
      className={styles["form"]}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => {
          removeAction();
        });
      }}
    >
      <ul className={styles["kept"]}>
        <li>Its page stays up, marked “Removed by the publisher.”</li>
        <li>Every version&apos;s address keeps working.</li>
        <li>Copies people already took are theirs and aren&apos;t affected.</li>
        <li>You can return it to search later.</li>
      </ul>
      {outcome.kind === "failed" && !isSaving ? (
        <p role="alert" className={styles["failed"]}>
          {changeFailedMessage}
        </p>
      ) : null}
      {outcome.kind === "signInEnded" && !isSaving ? (
        <SignInEnded then="remove it" />
      ) : null}
      <div className={styles["actions"]}>
        <button type="button" className={styles["cancel"]} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles["remove"]} disabled={isSaving}>
          {isSaving ? "Removing…" : "Remove from search"}
        </button>
      </div>
    </form>
  );
}
