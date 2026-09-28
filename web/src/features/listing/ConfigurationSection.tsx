import type { Listing } from "../../api/types";
import styles from "./ConfigurationSection.module.css";

/** Each environment variable the activity reads, with the purpose the publisher declared. */
export function ConfigurationSection({ configuration }: { configuration: Listing["configuration"] }) {
  if (configuration.length === 0) return <p className={styles.none}>This activity reads no environment variables.</p>;
  return (
    <>
      <p className={styles.intro}>Set these in the worker's environment before you start it.</p>
      <dl className={styles.list}>
        {configuration.map((variable) => (
          <div key={variable.name} className={styles.item}>
            <dt>
              <code>{variable.name}</code>
            </dt>
            <dd>{variable.purpose}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
