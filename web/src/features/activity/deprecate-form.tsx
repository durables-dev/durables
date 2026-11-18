import { deprecationReasonSchema } from "@durables/schemas";
import { startTransition, useActionState, useId, useState } from "react";
import {
  changeFailedMessage,
  changeRefusal,
  type ChangeRefusal,
} from "./change-refusal";
import styles from "./deprecate-form.module.css";
import type { ListingAddress } from "./listing-address";
import {
  defaultReplacement,
  noReplacement,
  replacementChoices,
} from "./replacement-choices";
import { SignInEnded } from "./sign-in-ended";
import { useDeprecate } from "./use-listing-changes";

export interface DeprecateFormProps {
  address: ListingAddress;
  /** Every version of the listing, newest first. */
  versions: readonly string[];
  /** Closes the dialog without saving. */
  onCancel: () => void;
  /** Closes the dialog once the deprecation is saved. */
  onSaved: () => void;
}

/** Where the latest press of Deprecate got to. */
type DeprecateOutcome =
  | { kind: "idle" }
  | { kind: "saved" }
  | { kind: "invalid"; message: string }
  | ChangeRefusal;

/** The reason's message for what is typed now: too long shows while typing. */
function reasonTooLong(typed: string): string | undefined {
  const parsed = deprecationReasonSchema.safeParse(typed);
  if (parsed.success) return undefined;
  const issue = parsed.error.issues.find(({ code }) => code === "too_big");
  return issue?.message;
}

// The body of the Deprecate dialog: the reason, required, and the version to point people to,
// then Cancel and Deprecate. Deprecate stays disabled until a reason is typed. A refused save
// keeps the dialog open with what was typed.
//
// The form submits through `onSubmit` rather than the `action` prop. React resets a form after
// its `action` returns, which would clear the reason after a failed save.
export function DeprecateForm({
  address,
  versions,
  onCancel,
  onSaved,
}: DeprecateFormProps) {
  const deprecate = useDeprecate(address);
  const reasonId = useId();
  const replacementId = useId();
  const [typed, setTyped] = useState("");

  const [outcome, deprecateAction, isSaving] = useActionState(
    async (
      previous: DeprecateOutcome,
      form: FormData,
    ): Promise<DeprecateOutcome> => {
      if (previous.kind === "saved") return previous;
      const reason = form.get("reason");
      const parsed = deprecationReasonSchema.safeParse(
        typeof reason === "string" ? reason : "",
      );
      if (!parsed.success) {
        const [issue] = parsed.error.issues;
        return { kind: "invalid", message: issue?.message ?? "" };
      }
      const replacement = form.get("replacement");
      try {
        await deprecate.mutateAsync({
          reason: parsed.data,
          replacement:
            typeof replacement === "string" && replacement !== noReplacement
              ? replacement
              : null,
        });
        onSaved();
        return { kind: "saved" };
      } catch (error) {
        return changeRefusal(error, ["reason", "replacement"]);
      }
    },
    { kind: "idle" },
  );

  const reasonMessage =
    reasonTooLong(typed) ??
    (outcome.kind === "invalid" ? outcome.message : undefined) ??
    (outcome.kind === "rejected" && outcome.field === "reason"
      ? outcome.message
      : undefined);
  const replacementMessage =
    outcome.kind === "rejected" && outcome.field === "replacement"
      ? outcome.message
      : undefined;

  return (
    <form
      className={styles["form"]}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => {
          deprecateAction(form);
        });
      }}
    >
      <div className={styles["field"]}>
        <label htmlFor={reasonId} className={styles["label"]}>
          Reason
        </label>
        <textarea
          id={reasonId}
          name="reason"
          rows={3}
          placeholder="What's wrong with this version, in a sentence"
          onChange={(event) => {
            setTyped(event.currentTarget.value);
          }}
          aria-invalid={reasonMessage !== undefined}
          aria-describedby={`${reasonId}-message`}
          className={styles["reason"]}
        />
        <p
          id={`${reasonId}-message`}
          className={styles["message"]}
          hidden={reasonMessage === undefined}
        >
          {reasonMessage}
        </p>
      </div>
      <div className={styles["field"]}>
        <label htmlFor={replacementId} className={styles["label"]}>
          Point people to
        </label>
        <select
          id={replacementId}
          name="replacement"
          defaultValue={defaultReplacement(versions, address.version)}
          aria-invalid={replacementMessage !== undefined}
          aria-describedby={`${replacementId}-message`}
          className={styles["replacement"]}
        >
          {replacementChoices(versions, address.version).map(
            ({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
        <p
          id={`${replacementId}-message`}
          className={styles["message"]}
          hidden={replacementMessage === undefined}
        >
          {replacementMessage}
        </p>
      </div>
      {outcome.kind === "failed" && !isSaving ? (
        <p role="alert" className={styles["failed"]}>
          {changeFailedMessage}
        </p>
      ) : null}
      {outcome.kind === "signInEnded" && !isSaving ? (
        <SignInEnded then="deprecate" />
      ) : null}
      <div className={styles["actions"]}>
        <button type="button" className={styles["cancel"]} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles["deprecate"]}
          disabled={typed.trim() === "" || isSaving}
        >
          {isSaving ? "Deprecating…" : `Deprecate ${address.version}`}
        </button>
      </div>
    </form>
  );
}
