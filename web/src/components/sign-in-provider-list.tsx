import { signInProviders, signInStartPath } from "@/lib/sign-in-providers";
import styles from "./sign-in-provider-list.module.css";

export interface SignInProviderListProps {
  /** The page a finished sign-in returns to. Left out, the api picks where it lands. */
  returnTo?: string | undefined;
}

// The four providers as equal choices: GitHub, GitLab, Google, Microsoft. Each is a plain
// link to the API's start route, so the browser leaves for the provider's consent screen.
// The Sign in page and the Contribute sign-in step both show it.
export function SignInProviderList({ returnTo }: SignInProviderListProps) {
  return (
    <ul className={styles["providers"]} aria-label="Sign-in providers">
      {signInProviders.map(({ id, name }) => (
        <li key={id}>
          <a
            href={signInStartPath(id, returnTo)}
            className={styles["provider"]}
            data-provider={id}
          >
            Continue with {name}
          </a>
        </li>
      ))}
    </ul>
  );
}
