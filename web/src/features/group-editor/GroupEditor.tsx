import { useMemo, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { publishGroup } from "../../api/groups";
import type { PublishGroupError, PublishGroupResult } from "../../api/types";
import { CodeView, type CodeMarker } from "../../components/code/CodeView";
import styles from "./GroupEditor.module.css";
import { useGroupResolution } from "./useGroupResolution";

type GroupEditorProps = {
  onPublished(result: PublishGroupResult): void;
};

// Python only in this claim. TypeScript and .NET groups arrive with step 9.
const SDKS = [
  { id: "python", label: "Python", enabled: true },
  { id: "typescript", label: "TypeScript", enabled: false },
  { id: "dotnet", label: ".NET", enabled: false },
] as const;

/**
 * Steps 6–7: paste activity addresses, one per line. api resolves each to its
 * pinned code under a comment block, read-only, with duplicate imports merged
 * at the top. Then name the group and publish it.
 */
export function GroupEditor({ onPublished }: GroupEditorProps) {
  const { source, setSource, resolved, problems, setProblems, pending, error: resolveError } = useGroupResolution();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const markers = useMemo<CodeMarker[]>(
    () => problems.map((problem) => ({ line: problem.line, message: problem.message, severity: "error" })),
    [problems],
  );
  const members = resolved && resolved.file === source ? resolved.members : [];
  const canPublish = !busy && !pending && name.trim() !== "" && members.length > 0 && problems.length === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setPublishError(null);
    try {
      onPublished(await publishGroup({ name: name.trim(), sdk: "python", source }));
    } catch (caught) {
      if (caught instanceof ApiError) {
        const flagged = (caught.payload as PublishGroupError | null)?.problems;
        if (flagged) setProblems(flagged);
      }
      setPublishError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className={styles.sdkRow} role="radiogroup" aria-label="SDK">
        <span className={styles.label}>SDK</span>
        {SDKS.map((sdk) => (
          <label
            key={sdk.id}
            className={sdk.enabled ? styles.sdk : `${styles.sdk} ${styles.disabled}`}
            title={sdk.enabled ? undefined : "Groups in this SDK aren't available yet."}
          >
            <input type="radio" name="sdk" value={sdk.id} checked={sdk.id === "python"} disabled={!sdk.enabled} readOnly />
            {sdk.label}
          </label>
        ))}
      </div>

      <p className={styles.hint}>
        Paste activity addresses, one per line, like <code>durables.dev/kisasa/charge-card</code>. Each one is replaced by
        that activity's code, pinned and read-only. An address without a version pins the latest.
      </p>
      <CodeView
        value={source}
        onChange={setSource}
        readOnlyRanges={resolved?.readOnlyRanges}
        markers={markers}
        cursorToEndOnReplace
        height={560}
      />

      <div className={styles.status}>
        {pending ? (
          <span>Resolving…</span>
        ) : (
          <span>
            {members.length} {members.length === 1 ? "member" : "members"}
            {problems.length > 0 && (
              <span className={styles.error}>
                {" "}
                · {problems.length} {problems.length === 1 ? "problem" : "problems"} flagged in the editor
              </span>
            )}
          </span>
        )}
        {resolveError && <span className={styles.error}>{resolveError}</span>}
      </div>

      <div className={styles.actions}>
        <label className={styles.name}>
          <span>Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="payments"
            pattern="[a-z0-9][a-z0-9\-]*"
            title="Lowercase letters, digits and hyphens, like payments."
            spellCheck={false}
            required
          />
        </label>
        <button type="submit" disabled={!canPublish}>
          {busy ? "Publishing…" : "Publish group"}
        </button>
        {publishError && <span className={styles.error}>{publishError}</span>}
      </div>
    </form>
  );
}
