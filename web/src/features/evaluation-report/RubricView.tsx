import { useEffect, useState } from "react";
import { getRubric } from "../../api/rubric";
import type { RubricEntry } from "../../api/types";
import { Badge } from "../../components/Badge";
import styles from "./RubricView.module.css";

const SDK_NAMES: Record<RubricEntry["sdk"], string> = { python: "Python" };

/** The published rubric: the exact patterns each tag is checked against. Each tag is anchored by its name. */
export function RubricView() {
  const [entries, setEntries] = useState<RubricEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRubric()
      .then(setEntries)
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, []);

  useEffect(() => {
    if (!entries || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [entries]);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!entries) return <p>Loading…</p>;

  const tags = [...new Set(entries.map((entry) => entry.tag))];
  return (
    <div>
      {tags.map((tag) => (
        <section key={tag} id={tag} className={styles.tag}>
          <h2>{tag}</h2>
          {entries
            .filter((entry) => entry.tag === tag)
            .map((entry) => (
              <div key={entry.sdk} className={styles.entry}>
                <Badge>{SDK_NAMES[entry.sdk]}</Badge>
                <p>{entry.description}</p>
                <p className={styles.caption}>A cited line is pattern-matched if it matches any of these regular expressions:</p>
                <ul className={styles.patterns}>
                  {entry.patterns.map((pattern) => (
                    <li key={pattern}>
                      <code>{pattern}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
