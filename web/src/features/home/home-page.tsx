import { PageTitle } from "@/components/page-title";
import styles from "./home-page.module.css";

// Bootstrap placeholder. The real home page (screen 1) replaces this. The page frame draws
// the header, the page body and the footer slot around it.
export function HomePage() {
  return (
    <div className={styles["hero"]}>
      <PageTitle />
      <h1 className={styles["headline"]}>
        Temporal activities, ready to copy.
      </h1>
    </div>
  );
}
