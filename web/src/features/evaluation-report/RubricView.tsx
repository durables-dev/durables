import { useEffect, useState } from "react";
import { getRubric } from "../../api/rubric";
import type { RubricEntry, Sdk } from "../../api/types";
import { Badge } from "../../components/Badge";
import { SDK_NAMES } from "../../lib/sdks";
import styles from "./RubricView.module.css";

/**
 * The published rubric: the exact patterns each tag is checked against, grouped
 * under its SDK. Each entry is anchored by its `anchor`, which is what a check's
 * "See the rubric" link points at.
 */
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

  const sdks = [...new Set(entries.map((entry) => entry.sdk))] as Sdk[];
  return (
    <div>
      {sdks.map((sdk) => (
        <section key={sdk} className={styles.sdk}>
          <h2>{SDK_NAMES[sdk]}</h2>
          {entries
            .filter((entry) => entry.sdk === sdk)
            .map((entry) => (
              <div key={entry.anchor} id={entry.anchor} className={styles.entry}>
                <Badge>{entry.tag}</Badge>
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
