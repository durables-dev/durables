import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Check } from "../../api/types";
import { Badge } from "../../components/Badge";
import { CodeView, type LineHighlight } from "../../components/code/CodeView";
import { LineLink } from "../../components/LineLink";
import { listingPath, parseAddress } from "../../lib/address";
import { CHECK_NAMES, ESTABLISHED_NAMES, STATUS_NAMES } from "../../lib/checks";
import styles from "./CheckResults.module.css";

type CheckResultsProps = {
  code: string;
  checks: Check[];
  /** The Monaco language of `code`, from the listing's SDK. */
  language?: string;
  /** Open the rubric and compensation links in a new tab, so an unfinished publish form survives. */
  linksInNewTab?: boolean;
};

/**
 * The evaluation report: each check, its status, how it was established, and
 * the evidence behind it. Every cited or detected line is a link that shows the
 * code with that check's lines highlighted. Compensation links to its listing.
 */
export function CheckResults({ code, checks, language = "python", linksInNewTab = false }: CheckResultsProps) {
  const withLines = checks.filter((check) => (check.lines ?? []).length > 0);
  const [selectedTag, setSelectedTag] = useState<Check["tag"] | null>(withLines[0]?.tag ?? null);
  const selected = checks.find((check) => check.tag === selectedTag && (check.lines ?? []).length > 0) ?? null;

  const highlights = useMemo<LineHighlight[]>(() => {
    if (!selected) return [];
    if (selected.tag === "idempotency") {
      const matched = new Set(selected.matchedLines ?? []);
      return (selected.lines ?? []).map((line) => ({ line, kind: matched.has(line) ? "matched" : "cited" }));
    }
    return (selected.lines ?? []).map((line) => ({ line, kind: "matched" }));
  }, [selected]);

  const target = linksInNewTab ? { target: "_blank", rel: "noreferrer" } : {};
  const showLines = (tag: Check["tag"]) => setSelectedTag(tag);

  return (
    <div>
      <ul className={styles.checks}>
        {checks.map((check) => (
          <li key={check.tag} className={check.tag === selected?.tag ? `${styles.check} ${styles.selected}` : styles.check}>
            <span className={styles.tag}>{CHECK_NAMES[check.tag]}</span>
            <Badge tone={check.status === "present" ? "success" : "muted"}>{STATUS_NAMES[check.status]}</Badge>
            <Badge tone={check.established === "declared" ? "neutral" : "success"}>{ESTABLISHED_NAMES[check.established]}</Badge>
            <span className={styles.detail}>
              <CheckDetail check={check} onShowLines={() => showLines(check.tag)} linkProps={target} />
            </span>
          </li>
        ))}
      </ul>
      {selected && (
        <>
          <p className={styles.legend}>
            Evidence for <strong>{CHECK_NAMES[selected.tag]}</strong>:
            {selected.tag === "idempotency" ? (
              <>
                <span className={styles.matchedSwatch} /> cited and matched the rubric pattern
                <span className={styles.citedSwatch} /> cited, did not match
              </>
            ) : (
              <>
                <span className={styles.matchedSwatch} /> where detection found it
              </>
            )}
          </p>
          <CodeView value={code} readOnly language={language} height={460} highlights={highlights} />
        </>
      )}
    </div>
  );
}

type CheckDetailProps = {
  check: Check;
  onShowLines(): void;
  linkProps: { target?: string; rel?: string };
};

function CheckDetail({ check, onShowLines, linkProps }: CheckDetailProps) {
  const lines = check.lines ?? [];
  const lineLinks = (label: string) =>
    lines.length > 0 && (
      <>
        {label}{" "}
        {lines.map((line, index) => (
          <span key={line}>
            {index > 0 && ", "}
            <LineLink line={line} onClick={onShowLines} />
          </span>
        ))}
        .{" "}
      </>
    );

  if (check.tag === "idempotency") {
    const matched = check.matchedLines ?? [];
    return (
      <>
        {lineLinks("Cited")}
        {lines.length > 0 && (matched.length > 0 ? <>Matched: {matched.join(", ")}. </> : <>No cited line matched. </>)}
        {check.rubricTag && (
          <a href={`/rubric#${check.rubricTag}`} target="_blank" rel="noreferrer">
            See the rubric
          </a>
        )}
      </>
    );
  }
  if (check.tag === "non-retryable-errors") {
    const types = check.errorTypes ?? [];
    return (
      <>
        {types.length > 0 ? (
          <>
            {types.map((type, index) => (
              <span key={type}>
                {index > 0 && ", "}
                <code>{type}</code>
              </span>
            ))}
            .{" "}
          </>
        ) : (
          <>No non-retryable error was found. </>
        )}
        {lineLinks("Found at")}
      </>
    );
  }
  if (check.tag === "compensation" && check.address) {
    const { owner, name, version } = parseAddress(check.address);
    return owner ? (
      <Link to={listingPath(owner, name, version)} {...linkProps}>
        {check.address}
      </Link>
    ) : (
      <code>{check.address}</code>
    );
  }
  if (check.tag === "heartbeat" && check.reason) return <>{check.reason}</>;
  return null;
}
