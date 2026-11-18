import { deprecationReasonSchema } from "@durables/schemas";
import { startTransition, useActionState, useId } from "react";
import { useNavigate } from "react-router";
import {
  deprecationValid,
  draftConfirmations,
  draftDeprecation,
  draftDetails,
  draftVersionFields,
} from "./draft";
import type { BaseVersion } from "./new-version";
import { newVersionRefusal } from "./new-version-refusal";
import ownStyles from "./new-version-review-step.module.css";
import { publishedPath, publishedState } from "./published-listing";
import { reviewConfirmations } from "./review-confirmations";
import {
  PreviewCard,
  ReviewConfirmations,
  type PublishOutcome,
} from "./review-step";
import styles from "./review-step.module.css";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath, type StepId } from "./steps";
import { stillNeeded } from "./still-needed";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";
import {
  usePublishNewVersion,
  type NewVersionRequest,
} from "./use-publish-new-version";

export interface NewVersionReviewStepProps {
  /** The version the new one starts from, and its listing. */
  base: BaseVersion;
  /** The finished steps, as the step list shows them. */
  finished: readonly StepId[];
}

/** The reason's message: empty or too long, in the shared rule's words. */
function reasonMessage(reason: string): string | undefined {
  const parsed = deprecationReasonSchema.safeParse(reason);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

// The Review step in new-version mode: the listing as it will appear at the new version, the
// offer to deprecate the base, the six confirmations, and Publish {version}. Deprecate {base}
// starts unchecked. Checked, it shows the reason, which starts as "Replaced by {new version}"
// and can be edited. The replacement is always the new version. When the activity is out of
// search, a note says publishing returns it. Publish stays disabled until all six are checked,
// nothing earlier is still needed, and a checked deprecation has a reason.
//
// A refused or failed publish keeps the publisher here with a message above Publish, and
// nothing in the draft is lost. Once published, the Published screen opens and the draft is
// cleared.
//
// The form submits through `onSubmit` rather than the `action` prop, as on a first publish:
// React resets a form after its `action` returns.
export function NewVersionReviewStep({
  base,
  finished,
}: NewVersionReviewStepProps) {
  const navigate = useNavigate();
  const { draft, dispatch } = useContributeDraft();
  const publish = usePublishNewVersion(base);
  const heading = useFocusOnAppear<HTMLHeadingElement>();
  const toggleId = useId();
  const reasonId = useId();
  const details = draftDetails(draft, base);
  const { version, whatChanged } = draftVersionFields(draft);
  const deprecation = draftDeprecation(draft);
  const confirmations = draftConfirmations(draft);
  const allConfirmed = reviewConfirmations.every(
    ({ key }) => confirmations[key],
  );
  const missing = stillNeeded(finished, "newVersion");
  const reasonInvalid = deprecation.checked
    ? reasonMessage(deprecation.reason)
    : undefined;
  const sdk =
    draft.check?.outcome === "accepted" ? draft.check.facts.sdk : undefined;

  const [outcome, publishAction, isPublishing] = useActionState(
    async (previous: PublishOutcome): Promise<PublishOutcome> => {
      // A press queued behind one that published does nothing.
      if (previous.kind === "published") return previous;
      const request: NewVersionRequest = {
        code: draft.code ?? "",
        ...(draft.declaredSdk === undefined
          ? {}
          : { declaredSdk: draft.declaredSdk }),
        title: details.title,
        description: details.description,
        version,
        basedOn: base.basedOn,
        whatChanged,
        deprecateBase: deprecation.checked
          ? { reason: deprecation.reason }
          : null,
        confirmations,
      };
      try {
        const published = await publish.mutateAsync(request);
        await navigate(publishedPath, {
          state: publishedState({
            handle: published.handle,
            name: published.name,
            version: published.version,
            accountCreated: false,
            basedOn: base.basedOn,
          }),
        });
        // The navigation commits in a transition. The draft is cleared in one too, so both
        // land together and Review never shows with the draft already cleared.
        startTransition(() => {
          dispatch({ type: "published" });
        });
        return { kind: "published" };
      } catch (error) {
        return { kind: "failed", message: newVersionRefusal(error) };
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
        handle={base.handle}
        details={details}
        version={version}
        sdk={sdk}
      />
      <div className={ownStyles["deprecate"]}>
        <div className={ownStyles["toggle"]}>
          <input
            id={toggleId}
            type="checkbox"
            className={ownStyles["checkbox"]}
            checked={deprecation.checked}
            onChange={(event) => {
              dispatch({
                type: "deprecateBaseToggled",
                checked: event.currentTarget.checked,
              });
            }}
          />
          <label htmlFor={toggleId}>
            Deprecate{" "}
            <span className={ownStyles["version"]}>{base.basedOn}</span>
          </label>
        </div>
        {deprecation.checked ? (
          <div className={ownStyles["field"]}>
            <label htmlFor={reasonId} className={ownStyles["label"]}>
              Reason
            </label>
            <textarea
              id={reasonId}
              name="reason"
              rows={2}
              value={deprecation.reason}
              onChange={(event) => {
                dispatch({
                  type: "deprecationReasonEdited",
                  reason: event.currentTarget.value,
                });
              }}
              aria-invalid={reasonInvalid !== undefined}
              aria-describedby={`${reasonId}-message`}
              className={ownStyles["reason"]}
            />
            <p
              id={`${reasonId}-message`}
              className={ownStyles["message"]}
              hidden={reasonInvalid === undefined}
            >
              {reasonInvalid}
            </p>
          </div>
        ) : null}
      </div>
      {base.removed ? (
        <p className={ownStyles["returns"]}>
          Publishing returns this activity to search.
        </p>
      ) : null}
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
        continueLabel={isPublishing ? "Publishing…" : `Publish ${version}`}
        continueDisabled={
          !allConfirmed ||
          missing.length > 0 ||
          !deprecationValid(draft) ||
          isPublishing
        }
      />
    </form>
  );
}
