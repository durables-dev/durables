import type { ReactNode } from "react";
import styles from "./page-message.module.css";
import { PageTitle } from "./page-title";

export interface PageMessageProps {
  /** The page's heading, which is also the first part of its tab title. */
  heading: string;
  /** What follows the heading, such as a sentence and a button. */
  children?: ReactNode;
}

// A page that is only a message, such as "Page not found": the tab title, the heading, and
// anything the page adds below it.
export function PageMessage({ heading, children }: PageMessageProps) {
  return (
    <div className={styles["message"]}>
      <PageTitle page={heading} />
      <h1 className={styles["heading"]}>{heading}</h1>
      {children === undefined ? null : (
        <div className={styles["body"]}>{children}</div>
      )}
    </div>
  );
}
