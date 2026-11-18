import { Link } from "react-router";
import { profilePath } from "@/lib/account-paths";
import { listingPath } from "@/lib/listing-path";
import { publishedAddress, type PublishedListing } from "./published-listing";
import styles from "./published-screen.module.css";
import stepStyles from "./step.module.css";
import { useFocusOnAppear } from "./use-focus-on-appear";

export interface PublishedScreenProps {
  listing: PublishedListing;
}

// The Published screen: a check mark, the heading, the live address, then View the listing and
// Go to your profile. For a first version it says the account now exists only when this
// publish created it. For a new version it says the version is now the latest. The step list
// and the Back and Continue bar are gone. The backup sign-in tip is left out of this epic.
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
        {listing.basedOn !== undefined ? (
          <>
            {" "}
            It's now the latest version. Earlier versions stay available at
            their own addresses.
          </>
        ) : listing.accountCreated ? (
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
        <Link to={profilePath} className={styles["profile"]}>
          Go to your profile
        </Link>
      </div>
    </section>
  );
}
