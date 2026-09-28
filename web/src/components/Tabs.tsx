import type { ReactNode } from "react";
import styles from "./Tabs.module.css";

export type TabItem = { id: string; label: string };

type TabsProps = {
  tabs: TabItem[];
  selected: string;
  onSelect(id: string): void;
  /** Shown at the right end of the tab strip, e.g. a copy button. */
  actions?: ReactNode;
  children: ReactNode;
};

/** A tab strip over one panel. The caller renders the selected tab's content as children. */
export function Tabs({ tabs, selected, onSelect, actions, children }: TabsProps) {
  return (
    <div className={styles.tabs}>
      <div className={styles.strip} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === selected}
            className={tab.id === selected ? `${styles.tab} ${styles.selected}` : styles.tab}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <span className={styles.actions}>{actions}</span>
      </div>
      <div role="tabpanel" className={styles.panel}>
        {children}
      </div>
    </div>
  );
}
