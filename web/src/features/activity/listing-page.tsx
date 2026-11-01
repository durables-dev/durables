import { PageMessage } from "@/components/page-message";
import { PageTitle } from "@/components/page-title";
import { problemFrom } from "@/lib/problem";
import { useQuery } from "@tanstack/react-query";
import { ConfigureSection } from "./configure-section";
import { ImplementSection } from "./implement-section";
import type { ListingAddress } from "./listing-address";
import { ListingLayout } from "./listing-layout";
import styles from "./listing-page.module.css";
import { listingQuery, versionQuery } from "./listing-queries";
import { ListingSidebar } from "./listing-sidebar";
import { ListingTop } from "./listing-top";
import { SourceSection } from "./source-section";

export interface ListingPageProps {
  address: ListingAddress;
}

function isNotFound(error: Error | null): boolean {
  return problemFrom(error)?.status === 404;
}

// The Activity page: the version and the listing, read as two queries, shown in the page
// shell. Each section story fills in its own slot of the layout below.
export function ListingPage({ address }: ListingPageProps) {
  const version = useQuery(versionQuery(address));
  const listing = useQuery(listingQuery(address));

  if (isNotFound(version.error) || isNotFound(listing.error)) {
    return <PageMessage heading="Page not found" />;
  }

  if (version.isError || listing.isError) {
    const retrying = version.isFetching || listing.isFetching;
    return (
      <PageMessage heading="Something went wrong">
        <p className={styles["failure"]}>
          This listing could not be loaded. Try again in a moment.
        </p>
        <button
          type="button"
          className={styles["retry"]}
          disabled={retrying}
          onClick={() => {
            if (version.isError) void version.refetch();
            if (listing.isError) void listing.refetch();
          }}
        >
          {retrying ? "Trying again…" : "Try again"}
        </button>
      </PageMessage>
    );
  }

  if (version.data === undefined || listing.data === undefined) {
    return (
      <p className={styles["loading"]} role="status">
        Loading the listing…
      </p>
    );
  }

  return (
    <>
      <PageTitle page={version.data.title} />
      <ListingLayout
        top={
          <ListingTop
            title={version.data.title}
            sdk={version.data.sdk}
            address={version.data.address}
            description={listing.data.description}
            handle={version.data.handle}
            publishedAt={version.data.publishedAt}
          />
        }
        implement={
          <ImplementSection version={version.data} sdk={version.data.sdk} />
        }
        configure={
          <ConfigureSection
            environmentVariables={version.data.facts.configurationRead.map(
              ({ name }) => name,
            )}
            input={version.data.facts.input}
            output={version.data.facts.output}
            runsAs={version.data.facts.runsAs}
            sdk={version.data.sdk}
          />
        }
        source={
          <SourceSection
            code={version.data.code}
            activityFileName={version.data.activityFileName}
            sdk={version.data.sdk}
          />
        }
        sidebar={
          <ListingSidebar
            sdk={version.data.sdk}
            integrations={version.data.integrations}
            dependencies={version.data.facts.dependencies.map(
              ({ name }) => name,
            )}
            publishedAt={version.data.publishedAt}
            handle={version.data.handle}
          />
        }
      />
    </>
  );
}
