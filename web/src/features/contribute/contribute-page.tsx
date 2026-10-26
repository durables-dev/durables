import { PageTitle } from "@/components/page-title";
import { sessionQuery } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { CodeStep } from "./code-step";
import styles from "./contribute-page.module.css";
import { DetailsStep } from "./details-step";
import { DetectedStep } from "./detected-step";
import { draftFinished } from "./draft";
import { ProfileStep } from "./profile-step";
import { publishedParam, readPublishedListing } from "./published-listing";
import { PublishedScreen } from "./published-screen";
import { ReviewStep } from "./review-step";
import { StepList } from "./step-list";
import { finishedSteps, resolveStep, stepPath } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";

// The Contribute flow: the page heading, the step list, then the current step. The address
// names the step. A missing, unknown or locked step redirects to the earliest unfinished one.
// A publisher who already has an account has finished Profile & Handle, so nothing is
// resolved until the session has been read once: the flow shows as busy until then. A read
// that failed counts as read. A later refetch does not hide the step again. Every step after
// Profile & Handle is for signed-in publishers only, so a signed-out visitor has finished
// nothing, whatever the draft holds, and lands on the sign-in step.
//
// After a publish, the address names the Published screen and the history entry carries what
// was published, so a reload shows it again. Without that, the address resolves like any
// other: the draft is empty, so the flow starts again.
export function ContributePage() {
  const { step: param } = useParams();
  const location = useLocation();
  const { draft } = useContributeDraft();
  const {
    data: session,
    dataUpdatedAt,
    errorUpdatedAt,
  } = useQuery(sessionQuery);

  const published =
    param === publishedParam ? readPublishedListing(location.state) : undefined;
  if (published !== undefined) {
    return (
      <ContributeFrame>
        <PublishedScreen listing={published} />
      </ContributeFrame>
    );
  }

  if (dataUpdatedAt === 0 && errorUpdatedAt === 0) {
    return (
      <ContributeFrame>
        <div className={styles["flow"]} aria-busy="true" />
      </ContributeFrame>
    );
  }

  const user = session?.user ?? null;
  const finished =
    user === null
      ? []
      : finishedSteps(draftFinished(draft), user.accountExists);
  const current = resolveStep(param, finished);

  if (current !== param) {
    return <Navigate to={stepPath(current)} replace />;
  }

  return (
    <ContributeFrame>
      <div className={styles["flow"]}>
        <StepList current={current} finished={finished} />
        <div className={styles["content"]}>
          {current === "profile" ? <ProfileStep /> : null}
          {current === "code" ? (
            <CodeStep returning={user?.accountExists === true} />
          ) : null}
          {current === "detected" ? <DetectedStep /> : null}
          {current === "details" ? <DetailsStep /> : null}
          {current === "review" ? (
            <ReviewStep handle={user?.handle ?? ""} finished={finished} />
          ) : null}
        </div>
      </div>
    </ContributeFrame>
  );
}

function ContributeFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles["page"]}>
      <PageTitle page="Contribute" />
      <hgroup className={styles["heading"]}>
        <p className={styles["kicker"]}>Contribute</p>
        <h1 className={styles["title"]}>New activity</h1>
      </hgroup>
      {children}
    </div>
  );
}
