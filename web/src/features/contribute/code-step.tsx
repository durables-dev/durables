import { useNavigate } from "react-router";
import styles from "./code-step.module.css";
import { isAccepted } from "./draft";
import { PasteEditor } from "./paste-editor";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";

export interface CodeStepProps {
  /** The publisher already has a Durables account, so they skipped Profile & Handle. */
  returning: boolean;
}

// The Code step: the publisher pastes the file that holds their activity. The editor shows at
// once, with no choice between linking a file and pasting. The code is kept in the draft, and
// changing it drops the last check. Continue opens Detected once a file is accepted. Back
// returns to the handle step, or for a returning publisher to the page the flow was opened
// from.
export function CodeStep({ returning }: CodeStepProps) {
  const navigate = useNavigate();
  const { draft, dispatch } = useContributeDraft();
  const heading = useFocusOnAppear<HTMLHeadingElement>();
  const accepted = isAccepted(draft);

  return (
    <section aria-label="Code" className={styles["step"]}>
      <div className={styles["intro"]}>
        <h2 ref={heading} tabIndex={-1} className={stepStyles["heading"]}>
          Paste your activity
        </h2>
        <p className={styles["lede"]}>
          Paste the file that contains your activity.
        </p>
      </div>
      <PasteEditor
        value={draft.code ?? ""}
        onChange={(code) => {
          dispatch({ type: "codeEdited", code });
        }}
        // Running the check, and showing what it found, come with the check call.
        onCheck={() => undefined}
      />
      <StepFooter
        onBack={() => {
          void navigate(
            returning ? (draft.origin ?? "/") : stepPath("profile"),
          );
        }}
        hint={accepted ? undefined : "Paste your activity's file"}
        continueDisabled={!accepted}
        onContinue={() => {
          void navigate(stepPath("detected"));
        }}
      />
    </section>
  );
}
