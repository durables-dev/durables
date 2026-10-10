import type { ReactNode } from "react";
import styles from "./page-frame.module.css";
import { SiteHeader } from "./site-header";

export interface PageFrameProps {
  children: ReactNode;
  /** False leaves out the footer slot. Defaults to true. */
  footer?: boolean;
}

// The frame every route renders inside: the header, the page's content, then the footer
// slot. "Add the footer" (DUR-12) fills the slot.
export function PageFrame({ children, footer = true }: PageFrameProps) {
  return (
    <div className={styles["frame"]}>
      <SiteHeader />
      <main className={styles["main"]}>{children}</main>
      {footer ? <footer className={styles["footer"]} /> : null}
    </div>
  );
}
