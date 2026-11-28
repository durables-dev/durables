import type { Search } from "@/lib/search-address";
import { appliedCategory } from "@/lib/search-filters";
import { useInfiniteQuery } from "@tanstack/react-query";
import { browseQuery } from "./browse-query";
import { countLine } from "./count-line";
import { ResultCard } from "./result-card";
import styles from "./search-results.module.css";
import { useReachEnd } from "./use-reach-end";

export interface SearchResultsProps {
  /** The search the address holds. */
  search: Search;
  /** Called when the empty state's Clear filters is clicked. */
  onClearAll: () => void;
  /** Called when the category pill is removed. */
  onRemoveCategory: () => void;
}

// The results area: the count and sort, with the category pill beside it while a category
// applies, then the cards in batches of 50. The next batch loads
// when the end of the list scrolls into view. A failure on a later batch keeps the cards
// already shown. While the first batch loads, or if it fails, the area says so instead.
export function SearchResults({
  search,
  onClearAll,
  onRemoveCategory,
}: SearchResultsProps) {
  const results = useInfiniteQuery(browseQuery(search));
  const canLoadMore =
    results.hasNextPage &&
    !results.isFetchingNextPage &&
    !results.isFetchNextPageError;
  const endRef = useReachEnd(() => {
    void results.fetchNextPage();
  }, canLoadMore);

  if (results.data === undefined) {
    if (results.isError) {
      return (
        <div className={styles["message"]}>
          <h2 className={styles["messageHeading"]}>Something went wrong</h2>
          <p className={styles["messageText"]}>
            Results could not be loaded. Try again in a moment.
          </p>
          <button
            type="button"
            className={styles["retry"]}
            disabled={results.isFetching}
            onClick={() => {
              void results.refetch();
            }}
          >
            {results.isFetching ? "Trying again…" : "Try again"}
          </button>
        </div>
      );
    }
    return (
      <p className={styles["loading"]} role="status">
        Loading activities…
      </p>
    );
  }

  const [first] = results.data.pages;
  const count = first?.count ?? 0;
  const cards = results.data.pages.flatMap((batch) => batch.activities);
  const category = appliedCategory(search);

  return (
    <div className={styles["results"]}>
      <div className={styles["summary"]}>
        <p className={styles["count"]} aria-live="polite">
          {countLine(count, first?.sort ?? "newest")}
        </p>
        {category === undefined ? null : (
          <button
            type="button"
            className={styles["pill"]}
            aria-label={`Remove ${category}`}
            onClick={onRemoveCategory}
          >
            {category}
            <span aria-hidden="true"> ×</span>
          </button>
        )}
      </div>
      {cards.length === 0 ? (
        <div className={styles["empty"]}>
          <h2 className={styles["messageHeading"]}>No activities match</h2>
          <p className={styles["messageText"]}>
            Try removing a filter or describing what you need differently.
          </p>
          <button
            type="button"
            className={styles["clearAll"]}
            onClick={onClearAll}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className={styles["grid"]}>
            {cards.map((card) => (
              <ResultCard key={card.address} card={card} />
            ))}
          </div>
          <div ref={endRef} className={styles["end"]}>
            <ListEnd
              hasMore={results.hasNextPage}
              loading={results.isFetchingNextPage}
              failed={results.isFetchNextPageError}
              onRetry={() => {
                void results.fetchNextPage();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface ListEndProps {
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

// What shows under the last card: "Loading more…" while the next batch comes, a way to try
// again if it failed, and "That's every match." once every match is on screen.
function ListEnd({ hasMore, loading, failed, onRetry }: ListEndProps) {
  if (loading) {
    return <p role="status">Loading more…</p>;
  }
  if (failed) {
    return (
      <>
        <p>More activities could not be loaded.</p>
        <button type="button" className={styles["retry"]} onClick={onRetry}>
          Try again
        </button>
      </>
    );
  }
  if (!hasMore) {
    return <p>That’s every match.</p>;
  }
  return null;
}
