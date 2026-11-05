import { PageMessage } from "@/components/page-message";
import type { Search } from "@/lib/search-address";
import styles from "./search-page.module.css";

export interface SearchPageProps {
  /** The search the address holds. */
  search: Search;
}

const anyValue = "Any";

// Placeholder. The results page story replaces it with the filters, the count and the cards.
// Until then it shows the search the address holds.
export function SearchPage({ search }: SearchPageProps) {
  return (
    <PageMessage heading="Search">
      <dl className={styles["search"]}>
        <dt>Words</dt>
        <dd>{search.words === "" ? "None" : search.words}</dd>
        <dt>Temporal SDK</dt>
        <dd>{search.sdks.length === 0 ? anyValue : search.sdks.join(", ")}</dd>
        <dt>Integrates with</dt>
        <dd>
          {search.integrations.length === 0
            ? anyValue
            : search.integrations.join(", ")}
        </dd>
        <dt>Publisher</dt>
        <dd>{search.publisher ?? anyValue}</dd>
      </dl>
    </PageMessage>
  );
}
