import { useSessionUser } from "@/lib/use-session-user";
import type { ListingDetails } from "@durables/schemas";
import { useId, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import {
  charactersLeft,
  detailsMessages,
  firstVersion,
  nameUsedMessage,
} from "./details-rules";
import styles from "./details-step.module.css";
import { detailsValid, draftDetails } from "./draft";
import { lowercaseAsTyped } from "./lowercase-as-typed";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";

// The Details step: the listing's title, the name in its address and a one-line description.
// The version is fixed at 1.0.0. Every edit goes straight to the draft, so the details are
// kept when the publisher leaves the step and comes back. The title and name start from the
// defaults the draft makes from the activity's name; the description starts empty. A field
// that breaks the shared rules says so underneath, and Continue waits until none does. There
// is no live check of the name: a name already used fails at publish, which sends the
// publisher back here with a message under the name while the name is the one refused.
export function DetailsStep() {
  const navigate = useNavigate();
  const { draft, dispatch } = useContributeDraft();
  const user = useSessionUser();
  const heading = useFocusOnAppear<HTMLHeadingElement>();
  const titleId = useId();
  const nameId = useId();
  const versionId = useId();
  const descriptionId = useId();

  const details = draftDetails(draft);
  const messages = detailsMessages(details);
  const nameMessage =
    messages.name ??
    (details.name === draft.usedName ? nameUsedMessage : undefined);
  const ready = detailsValid(draft);
  const handle = user?.handle ?? "your-handle";

  function edit(field: keyof ListingDetails, value: string) {
    dispatch({ type: "detailsEdited", field, value });
  }

  function onNameChange(event: ChangeEvent<HTMLInputElement>) {
    edit("name", lowercaseAsTyped(event.currentTarget));
  }

  // Continue is only enabled once the details in the draft pass the rules. Enter in a field
  // submits the form even so, so the draft is checked again before the step counts as
  // finished.
  function continueToReview() {
    if (!detailsValid(draft)) return;
    dispatch({ type: "stepFinished", step: "details" });
    void navigate(stepPath("review"));
  }

  return (
    <form action={continueToReview} className={styles["step"]}>
      <h2 ref={heading} tabIndex={-1} className={stepStyles["heading"]}>
        Listing details
      </h2>
      <div className={styles["field"]}>
        <label htmlFor={titleId} className={styles["label"]}>
          Title
        </label>
        <input
          id={titleId}
          name="title"
          type="text"
          defaultValue={details.title}
          onChange={(event) => {
            edit("title", event.currentTarget.value);
          }}
          autoComplete="off"
          aria-invalid={messages.title !== undefined}
          aria-describedby={`${titleId}-message`}
          className={styles["input"]}
        />
        <FieldMessage id={`${titleId}-message`} message={messages.title} />
      </div>
      <div className={styles["pair"]}>
        <div className={styles["field"]}>
          <label htmlFor={nameId} className={styles["label"]}>
            Name in the address
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            defaultValue={details.name}
            onChange={onNameChange}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={nameMessage !== undefined}
            aria-describedby={`${nameId}-message`}
            className={`${styles["input"]} ${styles["mono"]}`}
          />
          <FieldMessage id={`${nameId}-message`} message={nameMessage} />
        </div>
        <div className={styles["field"]}>
          <label htmlFor={versionId} className={styles["label"]}>
            Version
          </label>
          <input
            id={versionId}
            type="text"
            value={firstVersion}
            readOnly
            className={`${styles["input"]} ${styles["mono"]} ${styles["fixed"]}`}
          />
        </div>
      </div>
      <p className={styles["address"]}>
        durables.dev/{handle}/
        <strong className={styles["addressName"]}>{details.name}</strong>@
        {firstVersion}
      </p>
      <div className={styles["field"]}>
        <label htmlFor={descriptionId} className={styles["label"]}>
          One-line description
        </label>
        <input
          id={descriptionId}
          name="description"
          type="text"
          defaultValue={details.description}
          onChange={(event) => {
            edit("description", event.currentTarget.value);
          }}
          autoComplete="off"
          aria-invalid={messages.description !== undefined}
          aria-describedby={`${descriptionId}-message ${descriptionId}-help`}
          className={styles["input"]}
        />
        <FieldMessage
          id={`${descriptionId}-message`}
          message={messages.description}
        />
        <p id={`${descriptionId}-help`} className={styles["help"]}>
          Shown on search results. {charactersLeft(details.description)}{" "}
          characters left.
        </p>
      </div>
      <StepFooter
        onBack={() => {
          void navigate(stepPath("detected"));
        }}
        hint={ready ? undefined : "Complete the details"}
        continueDisabled={!ready}
      />
    </form>
  );
}

interface FieldMessageProps {
  id: string;
  message: string | undefined;
}

// The short message under a field. Always in the markup, so the field can point at it.
function FieldMessage({ id, message }: FieldMessageProps) {
  return (
    <p id={id} className={styles["message"]} hidden={message === undefined}>
      {message}
    </p>
  );
}
