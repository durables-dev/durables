import { Link } from "react-router";
import {
  listingPath,
  publishedAddress,
  type PublishedListing,
} from "./published-listing";
import styles from "./published-screen.module.css";
import stepStyles from "./step.module.css";
import { useFocusOnAppear } from "./use-focus-on-appear";

export interface PublishedScreenProps {
  listing: PublishedListing;
}

// The Published screen: a check mark, the heading, the live address and a link to the listing.
// It says the account now exists only when this publish created it. The step list and the
// Back and Continue bar are gone. "Go to your profile" and the backup sign-in note are left
// out of the MVP.
export function PublishedScreen({ listing }: PublishedScreenProps) {
  const heading = useFocusOnAppear<HTMLHeadingElement>();

  return (
    <section aria-label="Published" className={styles["screen"]}>
      <span className={styles["mark"]} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24">
          <path d="M5 12l5 5 9-10" />
        </svg>
      </span>
      <h2 ref={heading} tabIndex={-1} className={stepStyles["heading"]}>
        Published
      </h2>
      <p className={styles["live"]}>
        <span className={styles["address"]}>{publishedAddress(listing)}</span>{" "}
        is live.
        {listing.accountCreated ? (
          <>
            {" "}
            Your Durables account,{" "}
            <span className={styles["handle"]}>{listing.handle}</span>, now
            exists.
          </>
        ) : null}
      </p>
      <div className={styles["actions"]}>
        <Link to={listingPath(listing)} className={styles["view"]}>
          View the listing
        </Link>
      </div>
    </section>
  );
}
