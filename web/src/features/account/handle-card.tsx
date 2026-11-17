import { useId } from "react";
import styles from "./handle-card.module.css";

export interface HandleCardProps {
  handle: string;
}

// The owner's handle, and why it can never change.
export function HandleCard({ handle }: HandleCardProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={styles["card"]}>
      <h2 id={headingId} className={styles["heading"]}>
        Handle
      </h2>
      <p className={styles["handle"]}>{handle}</p>
      <p className={styles["note"]}>
        Every address you publish starts with it, like{" "}
        <span className={styles["mono"]}>{handle}/charge-card@2.0.0</span>.
        Handles can&apos;t be changed, because published addresses never change.
      </p>
    </section>
  );
}
