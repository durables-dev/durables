import { Link } from "react-router";
import styles from "./step-list.module.css";
import {
  flowSteps,
  isLocked,
  stepPath,
  steps,
  type Flow,
  type StepId,
} from "./steps";

export interface StepListProps {
  current: StepId;
  finished: readonly StepId[];
  /** A new version's flow has no Profile & Handle step. A first publish unless given. */
  flow?: Flow | undefined;
}

type StepState = "finished" | "current" | "open" | "locked";

function stepState(
  step: StepId,
  current: StepId,
  finished: readonly StepId[],
  flow: Flow,
): StepState {
  if (finished.includes(step)) return "finished";
  if (step === current) return "current";
  return isLocked(step, finished, flow) ? "locked" : "open";
}

function TickIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

interface StepItemProps {
  step: StepId;
  label: string;
  /** The step's number in the list. Profile & Handle has none and shows a person instead. */
  number?: number;
  current: StepId;
  finished: readonly StepId[];
  flow: Flow;
}

// One step: a link when it can be opened, plain text while it is locked. A finished step
// shows a tick. Its state is also spoken, since the tick and the lock are visual only.
function StepItem({
  step,
  label,
  number,
  current,
  finished,
  flow,
}: StepItemProps) {
  const state = stepState(step, current, finished, flow);
  const isCurrent = step === current;
  const mark = state === "finished" ? <TickIcon /> : (number ?? <PersonIcon />);
  const content = (
    <>
      <span className={styles["mark"]} data-state={state} aria-hidden="true">
        {mark}
      </span>
      <span>
        {label}
        {state === "finished" ? (
          <span className={styles["hidden"]}> (finished)</span>
        ) : null}
        {state === "locked" ? (
          <span className={styles["hidden"]}> (locked)</span>
        ) : null}
      </span>
    </>
  );

  return (
    <li>
      {state === "locked" ? (
        <span className={styles["step"]}>{content}</span>
      ) : (
        <Link
          to={stepPath(step)}
          aria-current={isCurrent ? "step" : undefined}
          className={styles["step"]}
          data-current={isCurrent || undefined}
        >
          {content}
        </Link>
      )}
    </li>
  );
}

// The left column of the Contribute flow: Profile & Handle on its own above a divider,
// then the numbered steps. A new version's flow has only the numbered steps.
export function StepList({ current, finished, flow = "first" }: StepListProps) {
  const [profile] = steps;
  const numbered = flowSteps(flow).filter(({ id }) => id !== profile.id);

  return (
    <nav aria-label="Steps" className={styles["nav"]}>
      {flow === "first" ? (
        <>
          <ul className={styles["list"]}>
            <StepItem
              step={profile.id}
              label={profile.label}
              current={current}
              finished={finished}
              flow={flow}
            />
          </ul>
          <hr className={styles["divider"]} />
        </>
      ) : null}
      <ol className={styles["list"]}>
        {numbered.map((step, index) => (
          <StepItem
            key={step.id}
            step={step.id}
            label={step.label}
            number={index + 1}
            current={current}
            finished={finished}
            flow={flow}
          />
        ))}
      </ol>
    </nav>
  );
}
