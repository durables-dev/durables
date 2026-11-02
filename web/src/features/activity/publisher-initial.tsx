import styles from "./publisher-initial.module.css";

export interface PublisherInitialProps {
  handle: string;
  /** "small" beside the handle at the top of the page, "large" in the Publisher card. */
  size: "small" | "large";
}

// The first letter of the publisher's handle in a round badge. It repeats the handle shown
// beside it, so it is hidden from assistive technology.
export function PublisherInitial({ handle, size }: PublisherInitialProps) {
  return (
    <span className={`${styles["initial"]} ${styles[size]}`} aria-hidden="true">
      {handle.charAt(0).toUpperCase()}
    </span>
  );
}
