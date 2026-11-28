import { ActivityTile } from "@/components/activity-tile";
import { IntegrationLink } from "@/components/integration-link";
import { PublisherInitial } from "@/components/publisher-initial";
import { listingPath } from "@/lib/listing-path";
import { publishedAgo } from "@/lib/published-ago";
import { searchAddress, type Search } from "@/lib/search-address";
import { useId } from "react";
import { Link } from "react-router";
import type { ActivityCard } from "./activity-card";
import styles from "./result-card.module.css";

export interface ResultCardProps {
  /** One result from the browse read. */
  card: ActivityCard;
  /** The search the results page is showing, which the card's filter links keep. */
  search: Search;
}

// One search result: the icon tile, the title, the address and the SDK; the description;
// the listing's chips under "Filters", each a link that makes it the only chip chosen and
// keeps the search's words, SDKs and category; the publisher, a link to that publisher's
// activities; when the version on the card was published; and View. The card shows no
// category. It never shows a rating, a count or any other popularity signal (DUR-2).
export function ResultCard({ card, search }: ResultCardProps) {
  const titleId = useId();
  const activityPath = listingPath(card);

  return (
    <article className={styles["card"]} aria-labelledby={titleId}>
      <div className={styles["top"]}>
        <ActivityTile title={card.title} handle={card.handle} />
        <div className={styles["identity"]}>
          <h2 id={titleId} className={styles["title"]}>
            <Link to={activityPath}>{card.title}</Link>
          </h2>
          <p className={styles["address"]} title={card.address}>
            {card.address}
          </p>
        </div>
        <p className={styles["sdk"]}>{card.sdk}</p>
      </div>
      {card.description === "" ? null : (
        <p className={styles["description"]}>{card.description}</p>
      )}
      {card.integrations.length === 0 ? null : (
        <div className={styles["filters"]}>
          <span className={styles["label"]}>Filters</span>
          <ul className={styles["filterList"]}>
            {card.integrations.map((chip) => (
              <li key={chip}>
                <IntegrationLink integration={chip} search={search} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles["footer"]}>
        <p className={styles["meta"]}>
          <Link
            to={searchAddress({ publisher: card.handle })}
            className={styles["publisher"]}
            aria-label={`More from ${card.handle}`}
          >
            <PublisherInitial handle={card.handle} size="small" />
            <span className={styles["handle"]}>{card.handle}</span>
          </Link>
          <span>
            Published{" "}
            <time dateTime={card.publishedAt}>
              {publishedAgo(card.publishedAt)}
            </time>
          </span>
        </p>
        <Link to={activityPath} className={styles["view"]}>
          View
        </Link>
      </div>
    </article>
  );
}
