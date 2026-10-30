import type { ReactNode } from "react";
import styles from "./listing-layout.module.css";
import type { ListingSectionId } from "./listing-sections";
import { SectionBar } from "./section-bar";

export interface ListingLayoutProps {
  /** The top of the page, above the section bar. */
  top: ReactNode;
  /** What each section holds. The section stories fill these in; until then they are empty. */
  implement?: ReactNode;
  configure?: ReactNode;
  source?: ReactNode;
  /** The sidebar column: the About and Publisher cards and the no-review note. */
  sidebar?: ReactNode;
}

// The Activity page's shell: the top, the stuck section bar, then a main column holding the
// Implement, Configure and Source anchors and a sidebar column. Below about 960px wide the
// sidebar moves under the main column.
export function ListingLayout({
  top,
  implement,
  configure,
  source,
  sidebar,
}: ListingLayoutProps) {
  return (
    <article className={styles["page"]}>
      <div className={styles["band"]}>{top}</div>
      <SectionBar />
      <div className={styles["columns"]}>
        <div className={styles["sections"]}>
          <Section id="implement">{implement}</Section>
          <Section id="configure">{configure}</Section>
          <Section id="source">{source}</Section>
        </div>
        <aside className={styles["sidebar"]}>{sidebar}</aside>
      </div>
    </article>
  );
}

interface SectionProps {
  id: ListingSectionId;
  children: ReactNode;
}

function Section({ id, children }: SectionProps) {
  return (
    <section id={id} className={styles["section"]}>
      {children}
    </section>
  );
}
