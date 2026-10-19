import { PageTitle } from "@/components/page-title";
import { sessionQuery } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router";
import styles from "./contribute-page.module.css";
import { ProfileStep } from "./profile-step";
import { StepList } from "./step-list";
import { finishedSteps, resolveStep, stepPath } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";

// The Contribute flow: the page heading, the step list, then the current step. The address
// names the step. A missing, unknown or locked step redirects to the earliest unfinished one.
// A publisher who already has an account has finished Profile & Handle.
export function ContributePage() {
  const { step: param } = useParams();
  const { draft } = useContributeDraft();
  const { data: session } = useQuery(sessionQuery);
  const finished = finishedSteps(
    draft.finished,
    session?.user?.accountExists === true,
  );
  const current = resolveStep(param, finished);

  if (current !== param) {
    return <Navigate to={stepPath(current)} replace />;
  }

  return (
    <div className={styles["page"]}>
      <PageTitle page="Contribute" />
      <hgroup className={styles["heading"]}>
        <p className={styles["kicker"]}>Contribute</p>
        <h1 className={styles["title"]}>New activity</h1>
      </hgroup>
      <div className={styles["flow"]}>
        <StepList current={current} finished={finished} />
        <div className={styles["content"]}>
          {current === "profile" ? <ProfileStep /> : null}
        </div>
      </div>
    </div>
  );
}
