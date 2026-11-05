import { PublisherInitial } from "@/components/publisher-initial";
import { listingPath } from "@/lib/listing-path";
import { publishedAgo } from "@/lib/published-ago";
import { searchAddress } from "@/lib/search-address";
import { integrationSchema } from "@durables/schemas";
import { useId } from "react";
import { Link } from "react-router";
import type { ActivityCard } from "./activity-card";
import styles from "./result-card.module.css";
import { tileColour } from "./tile-colour";

export interface ResultCardProps {
  /** One result from the browse read. */
  card: ActivityCard;
}

// One search result: the icon tile, the title, the address and the SDK; the description;
// the integrations, each a link to results for that integration alone; the publisher, a link
// to that publisher's activities; when the version on the card was published; and View.
// The card never shows a rating, a count or any other popularity signal (DUR-2).
export function ResultCard({ card }: ResultCardProps) {
  const titleId = useId();
  const activityPath = listingPath(card);
  const colour = tileColour(card.title, card.handle);

  return (
    <article className={styles["card"]} aria-labelledby={titleId}>
      <div className={styles["top"]}>
        <span
          className={`${styles["tile"]} ${styles[colour]}`}
          aria-hidden="true"
        >
          <svg width="60%" height="60%" viewBox="0 0 100 100">
            <path d="M14 18 H58 V36 L82 28 V72 L58 64 V82 H14 Z" />
          </svg>
        </span>
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
        <div className={styles["integrations"]}>
          <span className={styles["label"]}>Integrates with</span>
          <ul className={styles["integrationList"]}>
            {card.integrations.map((integration) => (
              <li key={integration}>
                <IntegrationLink integration={integration} />
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
