import { useSessionUser } from "@/lib/use-session-user";
import {
  whatChangedMaxLength,
  whatChangedSchema,
  type ListingDetails,
} from "@durables/schemas";
import { useId } from "react";
import { useNavigate } from "react-router";
import { charactersLeft, detailsMessages } from "./details-rules";
import { FieldMessage } from "./details-step";
import styles from "./details-step.module.css";
import {
  detailsValid,
  draftDetails,
  draftFacts,
  draftVersionFields,
  type DraftDetailField,
} from "./draft";
import {
  checkVersion,
  suggestVersion,
  versionAllowed,
  type BaseVersion,
} from "./new-version";
import ownStyles from "./new-version-details-step.module.css";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";

export interface NewVersionDetailsStepProps {
  /** The version the new one starts from, and its listing. */
  base: BaseVersion;
}

/** The message under What changed: empty or too long, in the shared rule's words. */
function whatChangedMessage(whatChanged: string): string | undefined {
  const parsed = whatChangedSchema.safeParse(whatChanged);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

// The Details step in new-version mode. The title and one-line description start from the base
// version's and can be edited; editing the description changes only the new version. The name
// in the address is the listing's and can't change. The version is typed, with the suggested
// number as its placeholder, and the address follows it as it is typed. Under the address, the
// suggestion says why, what the typed number would do, and offers Use {x}. What changed is
// required. Continue waits until every field passes.
export function NewVersionDetailsStep({ base }: NewVersionDetailsStepProps) {
  const navigate = useNavigate();
  const { draft, dispatch } = useContributeDraft();
  const user = useSessionUser();
  const heading = useFocusOnAppear<HTMLHeadingElement>();
  const titleId = useId();
  const nameId = useId();
  const versionId = useId();
  const suggestionId = useId();
  const whatChangedId = useId();
  const descriptionId = useId();

  const details: ListingDetails = draftDetails(draft, base);
  const messages = detailsMessages(details);
  const { version, whatChanged } = draftVersionFields(draft);
  const suggestion = suggestVersion(base, draftFacts(draft));
  const check = checkVersion(version, base, suggestion);
  const allowed = versionAllowed(check);
  const shownVersion = allowed ? version : suggestion.version;
  const noteMessage = whatChangedMessage(whatChanged);
  const ready = detailsValid(draft, base);
  const handle = user?.handle ?? base.handle;

  function edit(field: DraftDetailField, value: string) {
    dispatch({ type: "detailsEdited", field, value });
  }

  // Enter in a field submits the form even while Continue is disabled, so the draft is checked
  // again before the step counts as finished.
  function continueToReview() {
    if (!detailsValid(draft, base)) return;
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
            type="text"
            value={details.name}
            readOnly
            className={`${styles["input"]} ${styles["mono"]} ${styles["fixed"]}`}
          />
        </div>
        <div className={styles["field"]}>
          <label htmlFor={versionId} className={styles["label"]}>
            Version
          </label>
          <input
            id={versionId}
            name="version"
            type="text"
            value={version}
            placeholder={suggestion.version}
            onChange={(event) => {
              edit("version", event.currentTarget.value);
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={check.kind !== "empty" && !allowed}
            aria-describedby={suggestionId}
            className={`${styles["input"]} ${styles["mono"]}`}
          />
        </div>
      </div>
      <p className={styles["address"]}>
        durables.dev/{handle}/
        <strong className={styles["addressName"]}>{details.name}</strong>@
        {shownVersion}
      </p>
      <div id={suggestionId} role="status" className={ownStyles["suggestion"]}>
        <span>
          <span className={ownStyles["suggested"]}>
            Suggested:{" "}
            <span className={ownStyles["number"]}>{suggestion.version}</span>.
          </span>{" "}
          {suggestion.why}
        </span>
        {check.kind === "empty" ? null : (
          <span
            className={ownStyles["verdict"]}
            data-allowed={allowed || undefined}
          >
            {check.message}
          </span>
        )}
        {version === suggestion.version ? null : (
          <button
            type="button"
            className={ownStyles["use"]}
            onClick={() => {
              edit("version", suggestion.version);
            }}
          >
            Use {suggestion.version}
          </button>
        )}
      </div>
      <div className={styles["field"]}>
        <label htmlFor={whatChangedId} className={styles["label"]}>
          What changed
        </label>
        <input
          id={whatChangedId}
          name="whatChanged"
          type="text"
          defaultValue={whatChanged}
          onChange={(event) => {
            edit("whatChanged", event.currentTarget.value);
          }}
          autoComplete="off"
          aria-invalid={noteMessage !== undefined}
          aria-describedby={`${whatChangedId}-message ${whatChangedId}-help`}
          className={styles["input"]}
        />
        <FieldMessage id={`${whatChangedId}-message`} message={noteMessage} />
        <p id={`${whatChangedId}-help`} className={styles["help"]}>
          Shown in the version list. Can't be changed after publishing.{" "}
          {whatChangedMaxLength - whatChanged.length} characters left.
        </p>
      </div>
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
