import type { ListingDetails } from "@durables/schemas";
import { startTransition, useActionState, useId } from "react";
import { Link, useNavigate } from "react-router";
import type { CheckedFacts } from "./check-result";
import {
  draftConfirmations,
  draftDetails,
  type DraftConfirmations,
} from "./draft";
import { listingVersion } from "./listing-version";
import { publishRefusal } from "./publish-refusal";
import { publishedPath, publishedState } from "./published-listing";
import { reviewConfirmations } from "./review-confirmations";
import styles from "./review-step.module.css";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath, type StepId } from "./steps";
import { stillNeeded } from "./still-needed";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";
import { usePublish, type PublishRequest } from "./use-publish";

export interface ReviewStepProps {
  /** The publisher's chosen handle, the first part of the listing's address. */
  handle: string;
  /** The finished steps, as the step list shows them. */
  finished: readonly StepId[];
}

// The Review step: the listing as it will appear, the six confirmations, and Publish. Every
// box starts unchecked and each one is kept in the draft as it is checked, so a visit to the
// Terms page and Back returns to the step as it was. Publish stays disabled until all six are
// checked and nothing earlier is still needed.
//
// Publish sends the code, the SDK the publisher declared if they chose one, the details and
// the confirmations. While it is on its way the button
// says so and can't be pressed again. Once published, the Published screen opens and the draft
// is cleared. A name the publisher already used sends them back to Details, and a handle
// taken since they chose it sends them to the handle step. The rest of the draft is kept
// either way. Any other refusal shows a message above Publish and leaves the boxes as they are.
//
// The form submits through `onSubmit` rather than the `action` prop. React resets a form after
// its `action` returns, which would put each box back to how it was when Review rendered while
// the draft still has it checked.
export function ReviewStep({ handle, finished }: ReviewStepProps) {
  const navigate = useNavigate();
  const { draft, dispatch } = useContributeDraft();
  const publish = usePublish();
  const heading = useFocusOnAppear<HTMLHeadingElement>();
  const details = draftDetails(draft);
  const confirmations = draftConfirmations(draft);
  const allConfirmed = reviewConfirmations.every(
    ({ key }) => confirmations[key],
  );
  const missing = stillNeeded(finished);
  const sdk =
    draft.check?.outcome === "accepted" ? draft.check.facts.sdk : undefined;

  const [outcome, publishAction, isPublishing] = useActionState(
    async (previous: PublishOutcome): Promise<PublishOutcome> => {
      // A press queued behind one that published does nothing.
      if (previous.kind === "published") return previous;
      const request: PublishRequest = {
        code: draft.code ?? "",
        ...(draft.declaredSdk === undefined
          ? {}
          : { declaredSdk: draft.declaredSdk }),
        ...details,
        confirmations,
      };
      try {
        const published = await publish.mutateAsync(request);
        await navigate(publishedPath, {
          state: publishedState({
            handle: published.handle,
            name: published.name,
            version: published.version,
            accountCreated: published.accountCreated,
          }),
        });
        // React Router commits a navigation in a transition. The draft changes in one too, so
        // both land together and Review never shows with the draft already cleared.
        startTransition(() => {
          dispatch({ type: "published" });
        });
        return { kind: "published" };
      } catch (error) {
        const refusal = publishRefusal(error);
        switch (refusal.kind) {
          case "addressTaken":
            await navigate(stepPath("details"));
            startTransition(() => {
              dispatch({ type: "nameUsedAtPublish", name: request.name });
            });
            return { kind: "idle" };
          case "handleTaken":
            await navigate(stepPath("profile"));
            startTransition(() => {
              dispatch({
                type: "handleTakenAtPublish",
                handle: refusal.handle ?? handle,
              });
            });
            return { kind: "idle" };
          case "failed":
            return refusal;
        }
      }
    },
    { kind: "idle" },
  );

  return (
    <form
      aria-label="Review"
      className={styles["step"]}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => {
          publishAction();
        });
      }}
    >
      <div className={styles["intro"]}>
        <h2 ref={heading} tabIndex={-1} className={stepStyles["heading"]}>
          Review and publish
        </h2>
        <p className={styles["lede"]}>
          This is how your activity will appear. Once published, this version
          can't be edited.
        </p>
      </div>
      <PreviewCard
        handle={handle}
        details={details}
        version={listingVersion}
        sdk={sdk}
      />
      <ReviewConfirmations confirmations={confirmations} />
      {missing.length > 0 ? (
        <div role="alert" className={styles["missing"]}>
          Still needed before publishing: {missing.join(", ")}
        </div>
      ) : null}
      {outcome.kind === "failed" && !isPublishing ? (
        <p role="alert" className={styles["failed"]}>
          {outcome.message}
        </p>
      ) : null}
      <StepFooter
        onBack={() => {
          void navigate(stepPath("details"));
        }}
        hint={allConfirmed ? undefined : "Confirm each item above"}
        continueLabel={
          isPublishing ? "Publishing…" : `Publish ${listingVersion}`
        }
        continueDisabled={!allConfirmed || missing.length > 0 || isPublishing}
      />
    </form>
  );
}

/** Where the latest press of Publish got to. A refusal that moved the publisher on is idle. */
export type PublishOutcome =
  | { kind: "idle" }
  | { kind: "published" }
  | { kind: "failed"; message: string };

export interface PreviewCardProps {
  handle: string;
  details: ListingDetails;
  /** The version being published. */
  version: string;
  /** The SDK from the kept check. Absent while the pasted code is not accepted. */
  sdk: CheckedFacts["sdk"] | undefined;
}

// The listing as search results will show it: the default activity icon, the title, the
// address, the SDK and the one-line description.
export function PreviewCard({
  handle,
  details,
  version,
  sdk,
}: PreviewCardProps) {
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
            {handle}/{details.name}@{version}
          </p>
        </div>
        {sdk === undefined ? null : <p className={styles["sdk"]}>{sdk}</p>}
      </div>
      <p className={styles["description"]}>{details.description}</p>
    </section>
  );
}

export interface ReviewConfirmationsProps {
  confirmations: DraftConfirmations;
}

// The six confirmations and the disclaimer under them. Each box is kept in the draft as it is
// checked or unchecked.
export function ReviewConfirmations({
  confirmations,
}: ReviewConfirmationsProps) {
  const { dispatch } = useContributeDraft();
  return (
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
        anything published here and accepts no responsibility for how it's used.
        Read the full{" "}
        <Link to="/terms" className={styles["terms"]}>
          Terms
        </Link>
        .
      </p>
    </fieldset>
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
