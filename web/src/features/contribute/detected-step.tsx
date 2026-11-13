import { useSdkProfile } from "@/lib/use-sdk-profile";
import { Navigate, useNavigate } from "react-router";
import type { CheckedFacts } from "./check-result";
import { factRows } from "./detected-facts";
import styles from "./detected-step.module.css";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";

// The Detected step: what detection found in the accepted file, read from the draft's check.
// It asks nothing. Continue is always enabled and opens Details. Back returns to Code, where
// the draft still holds the pasted code. The flow only opens this step while the pasted file
// is accepted; without one, the publisher is sent to Code.
export function DetectedStep() {
  const { draft } = useContributeDraft();

  if (draft.check?.outcome !== "accepted") {
    return <Navigate to={stepPath("code")} replace />;
  }

  return <DetectedView facts={draft.check.facts} />;
}

interface DetectedViewProps {
  facts: CheckedFacts;
}

function DetectedView({ facts }: DetectedViewProps) {
  const navigate = useNavigate();
  const { dispatch } = useContributeDraft();
  const heading = useFocusOnAppear<HTMLHeadingElement>();

  return (
    <section aria-label="Detected" className={styles["step"]}>
      <div className={styles["intro"]}>
        <h2 ref={heading} tabIndex={-1} className={stepStyles["heading"]}>
          Detected
        </h2>
        <p className={styles["lede"]}>
          Here's what detection found in <code>{facts.activity.name}</code>.
        </p>
      </div>
      <FactsCard facts={facts} />
      <StepFooter
        onBack={() => {
          void navigate(stepPath("code"));
        }}
        continueDisabled={false}
        onContinue={() => {
          dispatch({ type: "stepFinished", step: "detected" });
          void navigate(stepPath("details"));
        }}
      />
    </section>
  );
}

interface FactsCardProps {
  facts: CheckedFacts;
}

// The "What we found" card: eight facts in two columns, each a small label above a monospace
// value. A fact detection couldn't find shows its fallback in muted text. The Runs as wording
// comes from the SDK catalog.
function FactsCard({ facts }: FactsCardProps) {
  const profile = useSdkProfile(facts.sdk);
  return (
    <section aria-labelledby="what-we-found" className={styles["card"]}>
      <div className={styles["cardHead"]}>
        <h3 id="what-we-found" className={styles["cardTitle"]}>
          What we found
        </h3>
        <p className={styles["method"]}>Regex, no AI</p>
      </div>
      <dl className={styles["facts"]}>
        {factRows(facts, profile).map((row) => (
          <div key={row.label} className={styles["fact"]}>
            <dt className={styles["label"]}>{row.label}</dt>
            <dd className={styles["value"]} data-found={row.found}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
