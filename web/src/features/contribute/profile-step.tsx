import { sessionQuery } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router";
import { HandleStep } from "./handle-step";
import { SignInStep } from "./sign-in-step";
import { readSignInView, signInParam } from "./sign-in-view";
import { stepPath } from "./steps";

// The Profile & Handle step. The session decides what it shows:
// - signed out, or the session cannot be read: the sign-in step;
// - signed in with no account yet: the handle step;
// - signed in with an account: nothing here, the flow goes on to Code.
// The address can ask for the sign-in step while signed in: after a sign-in that did not
// finish, or when the publisher goes back to choose a provider again.
export function ProfileStep() {
  const [searchParams] = useSearchParams();
  const view = readSignInView(searchParams.get(signInParam));
  const { data, isPending } = useQuery(sessionQuery);
  const user = data?.user ?? null;

  if (isPending) {
    return <section aria-label="Profile & Handle" aria-busy="true" />;
  }

  if (user === null || view !== undefined) {
    return (
      <section aria-label="Profile & Handle">
        <SignInStep failed={view === "failed"} signedIn={user !== null} />
      </section>
    );
  }

  if (user.accountExists) {
    return <Navigate to={stepPath("code")} replace />;
  }

  return (
    <section aria-label="Profile & Handle">
      <HandleStep />
    </section>
  );
}
