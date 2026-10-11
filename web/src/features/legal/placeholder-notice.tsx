import styles from "./placeholder-notice.module.css";

// Marks a legal page whose text the operator has not supplied yet. It sits above the
// placeholder body text and is removed when the real text replaces it.
export function PlaceholderNotice() {
  return (
    <div
      role="note"
      aria-label="Placeholder notice"
      className={styles["notice"]}
    >
      <p className={styles["label"]}>Placeholder text</p>
      <p className={styles["message"]}>
        The final text of this page is coming. Until it is published, the text
        below is a placeholder.
      </p>
    </div>
  );
}
