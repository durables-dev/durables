import { PageTitle } from "@/components/page-title";
import { SignInProviderList } from "@/components/sign-in-provider-list";
import { sessionQuery } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import styles from "./sign-in-page.module.css";

export interface SignInPageProps {
  /** The last sign-in did not finish: it failed or was cancelled. */
  failed: boolean;
  /** The page a finished sign-in returns to. Left out, the api picks where it lands. */
  returnTo: string | undefined;
}

// The Sign in page: four providers as equal choices, and no Durables password. Each provider
// starts sign-in with the page to return to. A signed-in visitor is not offered the providers.
// While the session is read, only the heading shows. A session that cannot be read is shown
// as signed out.
export function SignInPage({ failed, returnTo }: SignInPageProps) {
  const session = useQuery(sessionQuery);
  const user = session.data?.user ?? null;

  return (
    <div className={styles["page"]}>
      <PageTitle page="Sign in" />
      <h1 className={styles["heading"]}>Sign in</h1>
      {session.isPending ? null : user ? (
        <div className={styles["signed-in"]}>
          <p className={styles["lede"]}>You&apos;re already signed in.</p>
          <Link to={returnTo ?? "/"} className={styles["onward"]}>
            {returnTo === undefined ? "Go to Durables" : "Go back"}
          </Link>
        </div>
      ) : (
        <>
          {failed ? (
            <p role="alert" className={styles["failure"]}>
              Sign-in didn&apos;t finish. Try again, or choose another provider.
            </p>
          ) : null}
          <SignInProviderList returnTo={returnTo} />
          <p className={styles["note"]}>
            We keep your name, email and avatar from the provider, and you can
            see exactly what we kept on your profile.
          </p>
        </>
      )}
    </div>
  );
}
