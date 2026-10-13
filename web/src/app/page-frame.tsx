import type { ReactNode } from "react";
import styles from "./page-frame.module.css";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export interface PageFrameProps {
  children: ReactNode;
  /** False leaves out the footer. Defaults to true. */
  footer?: boolean;
}

// The frame every route renders inside: the header, the page's content, then the footer.
export function PageFrame({ children, footer = true }: PageFrameProps) {
  return (
    <div className={styles["frame"]}>
      <SiteHeader />
      <main className={styles["main"]}>{children}</main>
      {footer ? <SiteFooter /> : null}
    </div>
  );
}
