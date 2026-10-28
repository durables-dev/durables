import { PageMessage } from "@/components/page-message";
import { PageTitle } from "@/components/page-title";
import { problemFrom } from "@/lib/problem";
import { useQuery } from "@tanstack/react-query";
import type { ListingAddress } from "./listing-address";
import styles from "./listing-page.module.css";
import { listingQuery, versionQuery } from "./listing-queries";

export interface ListingPageProps {
  address: ListingAddress;
}

function isNotFound(error: Error | null): boolean {
  return problemFrom(error)?.status === 404;
}

// The minimal listing page: the title, the address and the description, so "View the
// listing" on the Published screen opens a real page. "Epic: Activity page" (DUR-7)
// replaces it with the full page.
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
    <article className={styles["page"]}>
      <PageTitle page={version.data.title} />
      <h1 className={styles["title"]}>{version.data.title}</h1>
      <p className={styles["address"]}>{version.data.address}</p>
      <p className={styles["description"]}>{listing.data.description}</p>
    </article>
  );
}
