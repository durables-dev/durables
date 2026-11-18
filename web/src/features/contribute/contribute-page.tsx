import { PageTitle } from "@/components/page-title";
import { signInPagePath } from "@/lib/account-paths";
import type { NewVersionBase } from "@/lib/new-version-entry";
import { sessionQuery, type SessionUser } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router";
import { CodeStep } from "./code-step";
import styles from "./contribute-page.module.css";
import { DetailsStep } from "./details-step";
import { DetectedStep } from "./detected-step";
import { draftFinished } from "./draft";
import { NewVersionDetailsStep } from "./new-version-details-step";
import { NewVersionReviewStep } from "./new-version-review-step";
import { ProfileStep } from "./profile-step";
import { publishedParam, readPublishedListing } from "./published-listing";
import { PublishedScreen } from "./published-screen";
import { ReviewStep } from "./review-step";
import { StepList } from "./step-list";
import { finishedSteps, resolveStep, stepPath } from "./steps";
import { useBaseVersion } from "./use-base-version";
import { useContributeDraft } from "./use-contribute-draft";

// The Contribute flow: the page heading, the step list, then the current step. The address
// names the step. A missing, unknown or locked step redirects to the earliest unfinished one.
// A publisher who already has an account has finished Profile & Handle, so nothing is
// resolved until the session has been read once: the flow shows as busy until then. A read
// that failed counts as read. A later refetch does not hide the step again. Every step after
// Profile & Handle is for signed-in publishers only, so a signed-out visitor has finished
// nothing, whatever the draft holds, and lands on the sign-in step.
//
// In new-version mode the draft names the listing and the version to start from. The flow has
// no Profile & Handle step, and waits for the base version and its listing to be read.
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
      <ContributeFrame
        newVersion={
          published.basedOn === undefined
            ? undefined
            : { ...published, basedOn: published.basedOn }
        }
      >
        <PublishedScreen listing={published} />
      </ContributeFrame>
    );
  }

  if (dataUpdatedAt === 0 && errorUpdatedAt === 0) {
    return (
      <ContributeFrame newVersion={draft.newVersion}>
        <div className={styles["flow"]} aria-busy="true" />
      </ContributeFrame>
    );
  }

  const user = session?.user ?? null;

  if (draft.newVersion !== undefined) {
    return (
      <NewVersionFlow newVersion={draft.newVersion} user={user} param={param} />
    );
  }

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

interface NewVersionFlowProps {
  newVersion: NewVersionBase;
  user: SessionUser | null;
  /** The step named in the address. */
  param: string | undefined;
}

// The flow in new-version mode: Code, Detected, Details and Review. Only the listing's
// publisher can publish a new version, so a signed-out visitor is asked to sign in, and anyone
// else is told the listing isn't theirs. The steps wait until the base has been read.
function NewVersionFlow({ newVersion, user, param }: NewVersionFlowProps) {
  const { draft } = useContributeDraft();
  const read = useBaseVersion(newVersion);
  const base = read.status === "ready" ? read.base : undefined;
  const baseAddress = `${newVersion.handle}/${newVersion.name}`;

  if (user === null) {
    return (
      <ContributeFrame newVersion={newVersion}>
        <p className={styles["message"]}>
          Sign in to publish a new version of {baseAddress}.{" "}
          <Link to={signInPagePath("/contribute")} className={styles["link"]}>
            Sign in
          </Link>
        </p>
      </ContributeFrame>
    );
  }

  if (user.handle !== newVersion.handle) {
    return (
      <ContributeFrame newVersion={newVersion}>
        <p className={styles["message"]}>
          Only the publisher of {baseAddress} can publish a new version of it.
        </p>
      </ContributeFrame>
    );
  }

  if (read.status === "notFound") {
    return (
      <ContributeFrame newVersion={newVersion}>
        <p className={styles["message"]}>
          {baseAddress} has no version {newVersion.basedOn} to start from.
        </p>
      </ContributeFrame>
    );
  }

  if (read.status === "failed") {
    return (
      <ContributeFrame newVersion={newVersion}>
        <p className={styles["message"]}>
          The version to start from could not be loaded. Try again in a moment.
        </p>
        <button
          type="button"
          className={styles["retry"]}
          disabled={read.retrying}
          onClick={read.retry}
        >
          {read.retrying ? "Trying again…" : "Try again"}
        </button>
      </ContributeFrame>
    );
  }

  if (base === undefined) {
    return (
      <ContributeFrame newVersion={newVersion}>
        <div className={styles["flow"]} aria-busy="true" />
      </ContributeFrame>
    );
  }

  const finished = draftFinished(draft, base);
  const current = resolveStep(param, finished, "newVersion");

  if (current !== param) {
    return <Navigate to={stepPath(current)} replace />;
  }

  return (
    <ContributeFrame newVersion={newVersion}>
      <div className={styles["flow"]}>
        <StepList current={current} finished={finished} flow="newVersion" />
        <div className={styles["content"]}>
          {current === "code" ? <CodeStep returning /> : null}
          {current === "detected" ? <DetectedStep /> : null}
          {current === "details" ? <NewVersionDetailsStep base={base} /> : null}
          {current === "review" ? (
            <NewVersionReviewStep base={base} finished={finished} />
          ) : null}
        </div>
      </div>
    </ContributeFrame>
  );
}

interface ContributeFrameProps {
  /** Set in new-version mode: the heading names the listing and the version it starts from. */
  newVersion?: NewVersionBase | undefined;
  children: ReactNode;
}

// The page heading above the flow. A first publish is "Contribute" and "New activity". A new
// version names the listing, then "New version" and the version it is based on.
function ContributeFrame({ newVersion, children }: ContributeFrameProps) {
  return (
    <div className={styles["page"]}>
      <PageTitle
        page={newVersion === undefined ? "Contribute" : "New version"}
        description="Publish a Temporal activity to Durables for the community to copy."
      />
      <hgroup className={styles["heading"]}>
        <p className={styles["kicker"]}>
          {newVersion === undefined
            ? "Contribute"
            : `${newVersion.handle}/${newVersion.name}`}
        </p>
        <h1 className={styles["title"]}>
          {newVersion === undefined ? "New activity" : "New version"}
        </h1>
        {newVersion === undefined ? null : (
          <p className={styles["based"]}>
            Based on{" "}
            <span className={styles["base"]}>{newVersion.basedOn}</span>. Title
            and description are filled in from it. The code and its behavior
            start fresh.
          </p>
        )}
      </hgroup>
      {children}
    </div>
  );
}
