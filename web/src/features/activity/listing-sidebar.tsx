import { useId, type ReactNode } from "react";
import type { Sdk } from "@/lib/sdk-language";
import styles from "./listing-sidebar.module.css";
import { publishedAgo } from "./published-ago";
import { PublisherInitial } from "./publisher-initial";
import { sdkPackage } from "./sdk-package";

export interface ListingSidebarProps {
  sdk: Sdk;
  /** The integrations implied by the code's imports. Empty hides the Integrates with row. */
  integrations: readonly string[];
  /** The third-party packages the code imports, beyond the SDK. */
  dependencies: readonly string[];
  /** When the version was published, as an ISO 8601 timestamp. */
  publishedAt: string;
  handle: string;
}

// The Activity page's sidebar: the About and Publisher cards, then the note that Durables
// doesn't review published code. Nothing here links into search (API map D19 to D22).
export function ListingSidebar({
  sdk,
  integrations,
  dependencies,
  publishedAt,
  handle,
}: ListingSidebarProps) {
  const aboutId = useId();
  const publisherId = useId();
  return (
    <>
      <section className={styles["card"]} aria-labelledby={aboutId}>
        <h2 id={aboutId} className={styles["heading"]}>
          About
        </h2>
        <dl className={styles["rows"]}>
          <AboutRow term="SDK">
            {sdk}, <span className={styles["mono"]}>{sdkPackage[sdk]}</span>
          </AboutRow>
          {integrations.length === 0 ? null : (
            <AboutRow term="Integrates with">
              {integrations.join(", ")}
            </AboutRow>
          )}
          <AboutRow term="Dependencies">
            {dependencies.length === 0 ? (
              "None beyond the SDK"
            ) : (
              <span className={styles["mono"]}>{dependencies.join(", ")}</span>
            )}
          </AboutRow>
          <AboutRow term="Published">
            <time dateTime={publishedAt}>{publishedAgo(publishedAt)}</time>
          </AboutRow>
          <AboutRow term="License">MIT-0</AboutRow>
        </dl>
      </section>
      <section className={styles["card"]} aria-labelledby={publisherId}>
        <h2 id={publisherId} className={styles["heading"]}>
          Publisher
        </h2>
        <p className={styles["publisher"]}>
          <PublisherInitial handle={handle} size="large" />
          <span className={styles["handle"]}>{handle}</span>
        </p>
      </section>
      <p className={styles["note"]}>
        Durables doesn&apos;t review published code. You are responsible for
        what you run.
      </p>
    </>
  );
}

interface AboutRowProps {
  term: string;
  children: ReactNode;
}

function AboutRow({ term, children }: AboutRowProps) {
  return (
    <div className={styles["row"]}>
      <dt className={styles["term"]}>{term}</dt>
      <dd className={styles["value"]}>{children}</dd>
    </div>
  );
}
