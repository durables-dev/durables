import { useNavigate } from "react-router";
import styles from "./sign-in-step.module.css";
import { signInProviders, signInStartPath } from "./sign-in-providers";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";

export interface SignInStepProps {
  /** The last sign-in did not finish: it failed or was cancelled. */
  failed: boolean;
  /** The publisher is already signed in, as when they come back from the handle step. */
  signedIn: boolean;
}

// The sign-in step: four providers as equal choices, and no Durables password. Each provider
// is a plain link to the API's start route, so the browser leaves for the provider's consent
// screen. Back returns to the page the flow was opened from, or home.
export function SignInStep({ failed, signedIn }: SignInStepProps) {
  const navigate = useNavigate();
  const { draft } = useContributeDraft();
  const heading = useFocusOnAppear<HTMLHeadingElement>();

  return (
    <div className={styles["step"]}>
      <div className={styles["intro"]}>
        <h2 ref={heading} tabIndex={-1} className={stepStyles["heading"]}>
          Sign in to contribute
        </h2>
        <p className={styles["lede"]}>
          Any of these works. Your account is created when you publish your
          first activity, and there are no Durables passwords.
        </p>
      </div>
      {failed ? (
        <p role="alert" className={styles["failure"]}>
          Sign-in didn&apos;t finish. Try again, or choose another provider.
        </p>
      ) : null}
      <ul className={styles["providers"]} aria-label="Sign-in providers">
        {signInProviders.map(({ id, name }) => (
          <li key={id}>
            <a
              href={signInStartPath(id)}
              className={styles["provider"]}
              data-provider={id}
            >
              Continue with {name}
            </a>
          </li>
        ))}
      </ul>
      <p className={styles["note"]}>
        We keep your name, email and avatar from the provider.
      </p>
      <StepFooter
        onBack={() => {
          void navigate(draft.origin ?? "/");
        }}
        hint={signedIn ? undefined : "Sign in to continue"}
        continueDisabled={!signedIn}
        onContinue={() => {
          void navigate(stepPath("profile"));
        }}
      />
    </div>
  );
}
