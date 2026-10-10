import styles from "./home-page.module.css";

// Bootstrap placeholder. The real home page (screen 1) replaces this.
export function HomePage() {
  return (
    <main className={styles["main"]}>
      <h1 className={styles["headline"]}>
        Temporal activities, ready to copy.
      </h1>
    </main>
  );
}
