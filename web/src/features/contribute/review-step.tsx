import type { ListingDetails } from "@durables/schemas";
import { useId } from "react";
import { Link, useNavigate } from "react-router";
import type { CheckedFacts } from "./check-result";
import { draftConfirmations, draftDetails } from "./draft";
import { listingVersion } from "./listing-version";
import { reviewConfirmations } from "./review-confirmations";
import styles from "./review-step.module.css";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath, type StepId } from "./steps";
import { stillNeeded } from "./still-needed";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";

export interface ReviewStepProps {
  /** The publisher's chosen handle, the first part of the listing's address. */
  handle: string;
  /** The finished steps, as the step list shows them. */
  finished: readonly StepId[];
}

// The Review step: the listing as it will appear, the six confirmations, and Publish. Every
// box starts unchecked and each one is kept in the draft as it is checked, so a visit to the
// Terms page and Back returns to the step as it was. Publish stays disabled until all six are
// checked and nothing earlier is still needed. Calling the publish endpoint is not part of
// this step yet (DUR-53).
export function ReviewStep({ handle, finished }: ReviewStepProps) {
  const navigate = useNavigate();
  const { draft, dispatch } = useContributeDraft();
  const heading = useFocusOnAppear<HTMLHeadingElement>();
  const details = draftDetails(draft);
  const confirmations = draftConfirmations(draft);
  const allConfirmed = reviewConfirmations.every(
    ({ key }) => confirmations[key],
  );
  const missing = stillNeeded(finished);
  const sdk =
    draft.check?.outcome === "accepted" ? draft.check.facts.sdk : undefined;

  return (
    <section aria-label="Review" className={styles["step"]}>
      <div className={styles["intro"]}>
        <h2 ref={heading} tabIndex={-1} className={stepStyles["heading"]}>
          Review and publish
        </h2>
        <p className={styles["lede"]}>
          This is how your activity will appear. Once published, this version
          can't be edited.
        </p>
      </div>
      <PreviewCard handle={handle} details={details} sdk={sdk} />
      <fieldset className={styles["confirmations"]}>
        <legend className={styles["legend"]}>
          Before you publish, confirm each of these
        </legend>
        {reviewConfirmations.map(({ key, text }) => (
          <Confirmation
            key={key}
            text={text}
            checked={confirmations[key]}
            onChange={(checked) => {
              dispatch({
                type: "confirmationToggled",
                confirmation: key,
                checked,
              });
            }}
          />
        ))}
        <p className={styles["disclaimer"]}>
          Durables hosts code as provided. It doesn't review, test or warrant
          anything published here and accepts no responsibility for how it's
          used. Read the full{" "}
          <Link to="/terms" className={styles["terms"]}>
            Terms
          </Link>
          .
        </p>
      </fieldset>
      {missing.length > 0 ? (
        <div role="alert" className={styles["missing"]}>
          Still needed before publishing: {missing.join(", ")}
        </div>
      ) : null}
      <StepFooter
        onBack={() => {
          void navigate(stepPath("details"));
        }}
        hint={allConfirmed ? undefined : "Confirm each item above"}
        continueLabel={`Publish ${listingVersion}`}
        continueDisabled={!allConfirmed || missing.length > 0}
        onContinue={() => {
          // Publishing is the next story (DUR-53).
        }}
      />
    </section>
  );
}

interface PreviewCardProps {
  handle: string;
  details: ListingDetails;
  /** The SDK from the kept check. Absent while the pasted code is not accepted. */
  sdk: CheckedFacts["sdk"] | undefined;
}

// The listing as search results will show it: the default activity icon, the title, the
// address, the SDK and the one-line description.
function PreviewCard({ handle, details, sdk }: PreviewCardProps) {
  return (
    <section aria-label="Listing preview" className={styles["card"]}>
      <div className={styles["cardHead"]}>
        <span className={styles["icon"]} aria-hidden="true">
          <svg width="60%" height="60%" viewBox="0 0 100 100">
            <path d="M14 18 H58 V36 L82 28 V72 L58 64 V82 H14 Z" />
          </svg>
        </span>
        <div className={styles["identity"]}>
          <h3 className={styles["title"]}>{details.title}</h3>
          <p className={styles["address"]}>
            {handle}/{details.name}@{listingVersion}
          </p>
        </div>
        {sdk === undefined ? null : <p className={styles["sdk"]}>{sdk}</p>}
      </div>
      <p className={styles["description"]}>{details.description}</p>
    </section>
  );
}

interface ConfirmationProps {
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Confirmation({ text, checked, onChange }: ConfirmationProps) {
  const id = useId();

  return (
    <div className={styles["confirmation"]}>
      <input
        id={id}
        type="checkbox"
        className={styles["checkbox"]}
        checked={checked}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <label htmlFor={id}>{text}</label>
    </div>
  );
}
