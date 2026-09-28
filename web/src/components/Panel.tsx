import type { ReactNode } from "react";
import styles from "./Panel.module.css";

export function Panel({ title, step, children }: { title: string; step?: number; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>
        {step !== undefined && <span className={styles.step}>{step}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}
