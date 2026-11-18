import { Fragment, useId, type ReactNode } from "react";
import { Link } from "react-router";
import styles from "./listing-sidebar.module.css";
import { publishedAgo } from "@/lib/published-ago";
import { searchAddress } from "@/lib/search-address";
import { IntegrationLink } from "@/components/integration-link";
import { PublisherInitial } from "@/components/publisher-initial";
import { useSdkProfile } from "@/lib/use-sdk-profile";
import { SdkAboutValue } from "./sdk-about-value";

export interface ListingSidebarProps {
  /** The activity's SDK, named as the api names it. */
  sdk: string;
  /**
   * The integrations implied by the code's imports, each a link to results for it alone.
   * Empty hides the Integrates with row.
   */
  integrations: readonly string[];
  /** The third-party packages the code imports, beyond the SDK. */
  dependencies: readonly string[];
  /** When the version was published, as an ISO 8601 timestamp. */
  publishedAt: string;
  handle: string;
}

// The Activity page's sidebar: the About and Publisher cards, then the note that Durables
// doesn't review published code. Each integration links to results for that integration,
// and the handle and "Search all activities by" link to that publisher's activities. The SDK's
// logo and package come from the SDK catalog; without the catalog's profile, the SDK row is its
// name.
export function ListingSidebar({
  sdk,
  integrations,
  dependencies,
  publishedAt,
  handle,
}: ListingSidebarProps) {
  const aboutId = useId();
  const publisherId = useId();
  const profile = useSdkProfile(sdk);
  const publisherSearchPath = searchAddress({ publisher: handle });
  return (
    <>
      <section className={styles["card"]} aria-labelledby={aboutId}>
        <h2 id={aboutId} className={styles["heading"]}>
          About
        </h2>
        <dl className={styles["rows"]}>
          <AboutRow term="SDK">
            <SdkAboutValue sdk={sdk} profile={profile} />
          </AboutRow>
          {integrations.length === 0 ? null : (
            <AboutRow term="Integrates with">
              {integrations.map((integration, position) => (
                <Fragment key={integration}>
                  {position === 0 ? null : ", "}
                  <IntegrationLink integration={integration} />
                </Fragment>
              ))}
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
      <section
        className={`${styles["card"]} ${styles["publisherCard"]}`}
        aria-labelledby={publisherId}
      >
        <h2 id={publisherId} className={styles["heading"]}>
          Publisher
        </h2>
        <p className={styles["publisher"]}>
          <PublisherInitial handle={handle} size="large" />
          <Link to={publisherSearchPath} className={styles["handle"]}>
            {handle}
          </Link>
        </p>
        <Link to={publisherSearchPath} className={styles["searchPublisher"]}>
          Search all activities by {handle}
        </Link>
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
