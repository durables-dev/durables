import { Fragment, useId, type ReactNode } from "react";
import { Link } from "react-router";
import { integrationSchema, type Sdk } from "@durables/schemas";
import styles from "./listing-sidebar.module.css";
import { publishedAgo } from "@/lib/published-ago";
import { searchAddress } from "@/lib/search-address";
import { PublisherInitial } from "@/components/publisher-initial";
import { sdkPackage } from "./sdk-package";

export interface ListingSidebarProps {
  sdk: Sdk;
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
// and the handle and "Search all activities by" link to that publisher's activities.
export function ListingSidebar({
  sdk,
  integrations,
  dependencies,
  publishedAt,
  handle,
}: ListingSidebarProps) {
  const aboutId = useId();
  const publisherId = useId();
  const publisherSearch = searchAddress({ publisher: handle });
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
          <Link to={publisherSearch} className={styles["handle"]}>
            {handle}
          </Link>
        </p>
        <Link to={publisherSearch} className={styles["searchPublisher"]}>
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

interface IntegrationLinkProps {
  integration: string;
}

// An integration on the shared list links to results for it alone. One the list does not
// know could not be searched for, so it shows as plain text.
function IntegrationLink({ integration }: IntegrationLinkProps) {
  const known = integrationSchema.safeParse(integration);
  if (!known.success) {
    return <span>{integration}</span>;
  }
  return (
    <Link
      to={searchAddress({ integrations: [known.data] })}
      className={styles["integration"]}
    >
      {integration}
    </Link>
  );
}
