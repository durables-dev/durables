import { PageTitle } from "@/components/page-title";
import type { ReactNode } from "react";
import styles from "./legal-page.module.css";

export interface LegalPageProps {
  /** The page's name: its heading and the first part of its tab title. */
  title: string;
  children: ReactNode;
}

// The layout the Terms, Privacy and Security pages share: the tab title, the heading, then
// the page's text in a readable column. The page frame draws the header and footer.
export function LegalPage({ title, children }: LegalPageProps) {
  return (
    <article className={styles["page"]}>
      <PageTitle page={title} />
      <h1 className={styles["heading"]}>{title}</h1>
      <div className={styles["body"]}>{children}</div>
    </article>
  );
}
