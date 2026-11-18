import type { ReactNode } from "react";
import styles from "./page-frame.module.css";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export interface PageFrameProps {
  children: ReactNode;
  /** False leaves out the footer. Defaults to true. */
  footer?: boolean;
  /** False leaves the Contribute button out of the header. Defaults to true. */
  contribute?: boolean;
  /** False leaves the Sign in link out of the header. Defaults to true. */
  signIn?: boolean;
}

// The frame every route renders inside: the header, the page's content, then the footer.
export function PageFrame({
  children,
  footer = true,
  contribute = true,
  signIn = true,
}: PageFrameProps) {
  return (
    <div className={styles["frame"]}>
      <SiteHeader contribute={contribute} signIn={signIn} />
      <main className={styles["main"]}>{children}</main>
      {footer ? <SiteFooter /> : null}
    </div>
  );
}
