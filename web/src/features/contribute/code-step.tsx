import { useNavigate } from "react-router";
import { chooseSdkHint } from "./check-line";
import { CheckLineRow } from "./check-line-row";
import styles from "./code-step.module.css";
import { isAccepted } from "./draft";
import { PasteEditor } from "./paste-editor";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath } from "./steps";
import { useCheckCode } from "./use-check-code";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";

export interface CodeStepProps {
  /** The publisher already has a Durables account, so they skipped Profile & Handle. */
  returning: boolean;
}

// The Code step: the publisher pastes the file that holds their activity. The editor shows at
// once, with no choice between linking a file and pasting. The code is kept in the draft, and
// changing it drops the last check. A paste, or a pause in typing, checks the code; the row
// under the editor says what the check found. Continue opens Detected once a file is
// accepted, and stays disabled while a check runs. While the api can't tell the SDK, the
// hint asks the publisher to choose it. Back returns to the handle step, or for a
// returning publisher to the page the flow was opened from.
export function CodeStep({ returning }: CodeStepProps) {
  const navigate = useNavigate();
  const { draft, dispatch } = useContributeDraft();
  const heading = useFocusOnAppear<HTMLHeadingElement>();
  const { check, declare, line, control } = useCheckCode();
  const accepted = isAccepted(draft) && line.kind !== "checking";
  const hint =
    control.kind === "choose" ? chooseSdkHint : "Paste your activity's file";

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
        onCheck={check}
      />
      <CheckLineRow
        line={line}
        control={control}
        code={draft.code ?? ""}
        onDeclare={declare}
      />
      <StepFooter
        onBack={() => {
          void navigate(
            returning ? (draft.origin ?? "/") : stepPath("profile"),
          );
        }}
        hint={accepted ? undefined : hint}
        continueDisabled={!accepted}
        onContinue={() => {
          void navigate(stepPath("detected"));
        }}
      />
    </section>
  );
}
