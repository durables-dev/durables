import { SignInProviderList } from "@/components/sign-in-provider-list";
import { useNavigate } from "react-router";
import styles from "./sign-in-step.module.css";
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

/**
 * Where a returning publisher's finished sign-in comes back to: Contribute, which picks the
 * step from the session. Someone with no account goes to Profile & Handle whatever this says.
 */
const contributeReturnPath = "/contribute";

// The sign-in step: four providers as equal choices, and no Durables password. Each provider
// is a plain link to the API's start route, so the browser leaves for the provider's consent
// screen, and a finished sign-in returns to Contribute. Back returns to the page the flow was
// opened from, or home.
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
      <SignInProviderList returnTo={contributeReturnPath} />
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
