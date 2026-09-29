import type { VersionBump, VersionSuggestion } from "../../api/types";
import { Badge, type BadgeTone } from "../../components/Badge";
import styles from "./VersionPanel.module.css";

const BUMP_LABELS: Record<VersionBump, string> = { major: "Major", minor: "Minor", patch: "Patch" };
const BUMP_TONES: Record<VersionBump, BadgeTone> = { major: "attention", minor: "neutral", patch: "muted" };

/**
 * Step 13's visible result on submit: the version api suggests for the pasted
 * code, compared with the publisher's highest published version, and why. It
 * informs; step 4 takes any higher version.
 */
export function VersionPanel({ suggestion }: { suggestion: VersionSuggestion }) {
  if (suggestion.bump === "first" || suggestion.previousVersion === null) {
    return (
      <p className={styles.summary}>
        <code>{suggestion.name}</code> isn't published yet, so this will be its first version,{" "}
        <Badge tone="neutral">{suggestion.suggestedVersion}</Badge>.
      </p>
    );
  }

  return (
    <>
      <dl className={styles.versions}>
        <dt>Published</dt>
        <dd>
          <code>
            {suggestion.name}@{suggestion.previousVersion}
          </code>
        </dd>
        <dt>Suggested</dt>
        <dd className={styles.suggested}>
          <Badge tone="neutral">{suggestion.suggestedVersion}</Badge>
          <Badge tone={BUMP_TONES[suggestion.bump]}>{BUMP_LABELS[suggestion.bump]} bump</Badge>
        </dd>
      </dl>
      <h3 className={styles.heading}>Why</h3>
      <ul className={styles.reasons}>
        {suggestion.reasons.map((reason) => (
          <li key={`${reason.kind}-${reason.message}`}>
            <Badge tone={BUMP_TONES[reason.bump]}>{BUMP_LABELS[reason.bump]}</Badge>
            <span>
              {reason.message}
              {reason.line !== undefined && <span className={styles.line}> Line {reason.line}.</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        You confirm the version in step 4. Any version higher than {suggestion.previousVersion} is accepted, and{" "}
        {suggestion.previousVersion} stays published, unchanged, at its own address.
      </p>
    </>
  );
}
