import styles from "./step-footer.module.css";

export interface StepFooterProps {
  onBack: () => void;
  /** Said beside Continue, as while it is disabled. */
  hint?: string | undefined;
  continueDisabled: boolean;
  /** Without it, Continue submits the form the footer sits in. */
  onContinue?: (() => void) | undefined;
  /** The forward button's label. "Continue" unless given, as on Review's "Publish 1.0.0". */
  continueLabel?: string | undefined;
}

// The foot of a step: Back at the left; at the right, the hint and Continue. The hint is a
// status region that is always in the markup, so a change to it is announced.
export function StepFooter({
  onBack,
  hint,
  continueDisabled,
  onContinue,
  continueLabel = "Continue",
}: StepFooterProps) {
  return (
    <div className={styles["footer"]}>
      <button type="button" className={styles["back"]} onClick={onBack}>
        Back
      </button>
      <div className={styles["next"]}>
        <span role="status" className={styles["hint"]}>
          {hint}
        </span>
        <button
          type={onContinue ? "button" : "submit"}
          className={styles["continue"]}
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}
