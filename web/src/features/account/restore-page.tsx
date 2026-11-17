import { PageTitle } from "@/components/page-title";
import { sessionQuery } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Link } from "react-router";
import {
  choiceFailedMessage,
  finalDate,
  restoreChoiceSchema,
  type RestoreChoiceName,
} from "./restore-choice";
import styles from "./restore-page.module.css";
import { useChooseRestore } from "./use-choose-restore";

/** Where the latest press of a choice got to. */
type ChoiceOutcome =
  | { kind: "idle" }
  | { kind: "chosen" }
  | { kind: "failed"; choice: RestoreChoiceName };

// The Restore prompt, where a sign-in lands when its account is pending deletion (ADR 0015).
// It names the handle and the day the deletion becomes final, and never lists the
// activities. Restore brings the account back; Start as a new user makes the deletion final
// now. A choice that fails keeps the prompt, with a message, and both choices stay available.
// With no sign-in held for the choice, the page says there is nothing to restore.
export function RestorePage() {
  const session = useQuery(sessionQuery);
  const choose = useChooseRestore();
  const choice = session.data?.restore;

  const [outcome, chooseAction, isChoosing] = useActionState(
    async (previous: ChoiceOutcome, form: FormData): Promise<ChoiceOutcome> => {
      // A press queued behind one that finished does nothing.
      if (previous.kind === "chosen") return previous;
      const parsed = restoreChoiceSchema.safeParse(form.get("choice"));
      if (!parsed.success) return previous;
      try {
        await choose.mutateAsync(parsed.data);
        return { kind: "chosen" };
      } catch {
        return { kind: "failed", choice: parsed.data };
      }
    },
    { kind: "idle" },
  );

  // Once a choice has finished, the session no longer offers it and the page is on its way
  // to the profile or Contribute, so it shows nothing more.
  const leaving = isChoosing || outcome.kind === "chosen";

  return (
    <div className={styles["page"]}>
      <PageTitle page="Restore your account" />
      <h1 className={styles["heading"]}>Restore your account?</h1>
      {choice ? (
        <form action={chooseAction} className={styles["prompt"]}>
          <PromptText handle={choice.handle} finalAt={choice.finalAt} />
          {outcome.kind === "failed" && !isChoosing ? (
            <p role="alert" className={styles["failure"]}>
              {choiceFailedMessage(outcome.choice)}
            </p>
          ) : null}
          <ChoiceButtons />
        </form>
      ) : session.isPending || leaving ? null : (
        <div className={styles["nothing"]}>
          <p className={styles["lede"]}>
            There&apos;s no deleted account waiting to be restored.
          </p>
          <Link to="/" className={styles["onward"]}>
            Go to Durables
          </Link>
        </div>
      )}
    </div>
  );
}

interface PromptTextProps {
  handle: string | null;
  finalAt: string;
}

// What the prompt says: the handle, the day the deletion becomes final, and what each choice
// does. The activities themselves are not listed.
function PromptText({ handle, finalAt }: PromptTextProps) {
  const day = finalDate(finalAt);
  const name =
    handle === null ? null : <span className={styles["handle"]}>{handle}</span>;

  return (
    <>
      <p className={styles["lede"]}>
        {name === null ? (
          "Your account is waiting to be deleted."
        ) : (
          <>Your account {name} is waiting to be deleted.</>
        )}{" "}
        {day === undefined ? (
          "The deletion becomes final 30 days after you asked for it."
        ) : (
          <>The deletion becomes final on {day}.</>
        )}
      </p>
      <p className={styles["text"]}>
        Restore brings your account back, with the activities that were listed
        when you deleted it. Start as a new user deletes it for good now,
        retires {name ?? "its handle"}, and lets you choose a new handle.
      </p>
    </>
  );
}

// The two choices. While one is being made, both are disabled and the pressed one says so.
function ChoiceButtons() {
  const { pending, data } = useFormStatus();
  const pressed = pending ? data?.get("choice") : null;

  return (
    <div className={styles["actions"]}>
      <button
        type="submit"
        name="choice"
        value="restore"
        disabled={pending}
        className={styles["restore"]}
      >
        {pressed === "restore" ? "Restoring…" : "Restore"}
      </button>
      <button
        type="submit"
        name="choice"
        value="start-over"
        disabled={pending}
        className={styles["startOver"]}
      >
        {pressed === "start-over" ? "Starting over…" : "Start as a new user"}
      </button>
    </div>
  );
}
