import type { SignInProvider } from "@/lib/sign-in-providers";
import { useId } from "react";
import styles from "./provider-card.module.css";
import type { ProviderDetails } from "./profile-queries";
import { providerName, providerRows } from "./provider-rows";

export interface ProviderCardProps {
  provider: SignInProvider;
  details: ProviderDetails;
}

// What the provider told Durables at the last sign-in, row by row. A value the provider did
// not give still has its row. The avatar is described, never shown.
export function ProviderCard({ provider, details }: ProviderCardProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={styles["card"]}>
      <div className={styles["title-row"]}>
        <h2 id={headingId} className={styles["heading"]}>
          From {providerName(provider)}
        </h2>
        <p className={styles["refreshed"]}>Refreshed each time you sign in.</p>
      </div>
      <dl className={styles["rows"]}>
        {providerRows(provider, details).map((row) => (
          <div key={row.label} className={styles["row"]}>
            <dt className={styles["label"]}>{row.label}</dt>
            {row.value === null ? (
              <dd className={styles["missing"]}>Not provided</dd>
            ) : (
              <dd className={row.mono ? styles["mono"] : styles["value"]}>
                {row.value}
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className={styles["note"]}>
        Durables stores only your provider and its account ID. Your name, email
        and avatar stay in your sign-in session. No password.
      </p>
    </section>
  );
}
