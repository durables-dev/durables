import { useMemo } from "react";
import type { Check, TagStatus } from "../../api/types";
import { Badge } from "../../components/Badge";
import { CodeView, type LineHighlight } from "../../components/code/CodeView";
import styles from "./CheckResults.module.css";

const TAG_NAMES: Record<Check["tag"], string> = {
  idempotency: "Idempotent",
  compensation: "Compensation",
  heartbeat: "Heartbeats",
};

const STATUS_NAMES: Record<TagStatus, string> = {
  present: "Present",
  absent: "Absent",
  "not-applicable": "Not applicable",
};

/** Step 3's visible result: each check, how it was established, and the cited lines highlighted in the code. */
export function CheckResults({ code, checks }: { code: string; checks: Check[] }) {
  const highlights = useMemo<LineHighlight[]>(() => {
    const idempotency = checks.find((check) => check.tag === "idempotency");
    const matched = new Set(idempotency?.matchedLines ?? []);
    return (idempotency?.lines ?? []).map((line) => ({ line, kind: matched.has(line) ? "matched" : "cited" }));
  }, [checks]);

  return (
    <div>
      <ul className={styles.checks}>
        {checks.map((check) => (
          <li key={check.tag} className={styles.check}>
            <span className={styles.tag}>{TAG_NAMES[check.tag]}</span>
            <Badge tone={check.status === "present" ? "success" : "muted"}>{STATUS_NAMES[check.status]}</Badge>
            <Badge tone={check.established === "pattern-matched" ? "success" : "neutral"}>
              {check.established === "pattern-matched" ? "pattern-matched" : "declared by the publisher"}
            </Badge>
            <span className={styles.detail}>
              <CheckDetail check={check} />
            </span>
          </li>
        ))}
      </ul>
      {highlights.length > 0 && (
        <>
          <p className={styles.legend}>
            <span className={styles.matchedSwatch} /> cited and matched the rubric pattern
            <span className={styles.citedSwatch} /> cited, did not match
          </p>
          <CodeView value={code} readOnly height={460} highlights={highlights} />
        </>
      )}
    </div>
  );
}

function CheckDetail({ check }: { check: Check }) {
  if (check.tag === "idempotency") {
    const lines = check.lines ?? [];
    const matched = check.matchedLines ?? [];
    return (
      <>
        {lines.length > 0 && <>Cited lines {lines.join(", ")}. </>}
        {lines.length > 0 && (matched.length > 0 ? <>Matched: {matched.join(", ")}. </> : <>No cited line matched. </>)}
        {check.rubricTag && (
          <a href={`/rubric#${check.rubricTag}`} target="_blank" rel="noreferrer">
            See the rubric
          </a>
        )}
      </>
    );
  }
  if (check.tag === "compensation" && check.address) return <code>{check.address}</code>;
  if (check.tag === "heartbeat" && check.reason) return <>{check.reason}</>;
  return null;
}
