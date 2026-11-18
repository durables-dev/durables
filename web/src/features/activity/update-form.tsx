import { listingDescriptionSchema } from "@durables/schemas";
import { startTransition, useActionState, useId, useState } from "react";
import { charactersLeft, descriptionMessage } from "./description-field";
import type { ListingAddress } from "./listing-address";
import {
  saveFailedMessage,
  saveRefusal,
  type SaveRefusal,
} from "./save-refusal";
import { SignInEnded } from "./sign-in-ended";
import styles from "./update-form.module.css";
import { useSaveDescription } from "./use-save-description";

export interface UpdateFormProps {
  address: ListingAddress;
  /** The viewed version's saved description, which the field starts with. */
  description: string;
  /** Closes the dialog without saving. */
  onCancel: () => void;
  /** Closes the dialog once the description is saved. */
  onSaved: () => void;
}

/** Where the latest press of Save got to. */
type SaveOutcome =
  { kind: "idle" } | { kind: "invalid" } | { kind: "saved" } | SaveRefusal;

// The body of the Update dialog: the one-line description, the note on what can't be changed
// here, and Cancel and Save changes. The field starts with the saved description and typing
// is never cut off. Too long says so while typing; empty says so once Save is pressed. Either
// way nothing is sent. Save sends the trimmed text and the dialog closes once it is saved,
// with no message. A refused save keeps the dialog open with what was typed.
//
// The form submits through `onSubmit` rather than the `action` prop. React resets a form after
// its `action` returns, which would put the field back to the saved description after a
// failed save.
export function UpdateForm({
  address,
  description,
  onCancel,
  onSaved,
}: UpdateFormProps) {
  const save = useSaveDescription(address);
  const fieldId = useId();
  const [typed, setTyped] = useState(description);

  const [outcome, saveAction, isSaving] = useActionState(
    async (previous: SaveOutcome, form: FormData): Promise<SaveOutcome> => {
      // A press queued behind one that saved does nothing.
      if (previous.kind === "saved") return previous;
      const value = form.get("description");
      const parsed = listingDescriptionSchema.safeParse(
        typeof value === "string" ? value : "",
      );
      if (!parsed.success) return { kind: "invalid" };
      try {
        await save.mutateAsync(parsed.data);
        onSaved();
        return { kind: "saved" };
      } catch (error) {
        return saveRefusal(error);
      }
    },
    { kind: "idle" },
  );

  const fieldMessage =
    descriptionMessage(typed, outcome.kind === "invalid") ??
    (outcome.kind === "rejected" ? outcome.message : undefined);

  return (
    <form
      className={styles["form"]}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => {
          saveAction(form);
        });
      }}
    >
      <div className={styles["field"]}>
        <label htmlFor={fieldId} className={styles["label"]}>
          One-line description
        </label>
        <input
          id={fieldId}
          name="description"
          type="text"
          defaultValue={description}
          onChange={(event) => {
            setTyped(event.currentTarget.value);
          }}
          autoComplete="off"
          aria-invalid={fieldMessage !== undefined}
          aria-describedby={`${fieldId}-message ${fieldId}-help`}
          className={styles["input"]}
        />
        <p
          id={`${fieldId}-message`}
          className={styles["message"]}
          hidden={fieldMessage === undefined}
        >
          {fieldMessage}
        </p>
        <p id={`${fieldId}-help`} className={styles["help"]}>
          Shown on search results. {charactersLeft(typed)} characters left.
        </p>
      </div>
      <p className={styles["fixed"]}>
        Can&apos;t change here: the code, its detected facts and its address.
        Those are fixed when a version is published.
      </p>
      {outcome.kind === "failed" && !isSaving ? (
        <p role="alert" className={styles["failed"]}>
          {saveFailedMessage}
        </p>
      ) : null}
      {outcome.kind === "signInEnded" && !isSaving ? (
        <SignInEnded then="save" />
      ) : null}
      <div className={styles["actions"]}>
        <button type="button" className={styles["cancel"]} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles["save"]} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
