import { useEffect, useState, type FormEvent } from "react";
import { publishActivity } from "../../api/activities";
import { ApiError } from "../../api/client";
import { getReadmeTemplate } from "../../api/readme-template";
import type { Declarations, PublishError, PublishResult, ReadmeTemplate, VersionSuggestion } from "../../api/types";
import { CodeView } from "../../components/code/CodeView";
import styles from "./ReadmeEditor.module.css";

type ReadmeEditorProps = {
  code: string;
  declarations: Declarations;
  /** From step 1. When the name is already published, it prefills the version field. */
  suggestion: VersionSuggestion;
  onPublished(result: PublishResult): void;
};

const EXAMPLE_INPUT_PLACEHOLDER = '{\n  "amount_cents": 1999\n}';

/**
 * Step 4: fill in the README template, give an example input for the starter
 * snippet, and publish. api checks the required headings and names any that are
 * missing or empty. When the name is already published (step 13), the publisher
 * also confirms the new version, prefilled with the suggestion and editable.
 */
export function ReadmeEditor({ code, declarations, suggestion, onPublished }: ReadmeEditorProps) {
  const newVersion = suggestion.previousVersion !== null;
  const [version, setVersion] = useState(suggestion.suggestedVersion);
  const [template, setTemplate] = useState<ReadmeTemplate | null>(null);
  const [readme, setReadme] = useState("");
  const [exampleInput, setExampleInput] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReadmeTemplate()
      .then((loaded) => {
        setTemplate(loaded);
        setReadme(loaded.markdown);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMissing([]);
    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(exampleInput);
    } catch {
      setError("The example input isn't valid JSON.");
      return;
    }
    if (typeof parsedInput !== "object" || parsedInput === null || Array.isArray(parsedInput)) {
      setError("The example input must be a JSON object.");
      return;
    }
    setBusy(true);
    try {
      onPublished(
        await publishActivity({
          code,
          declarations,
          readme,
          exampleInput: parsedInput as Record<string, unknown>,
          ...(newVersion ? { version: version.trim() } : {}),
        }),
      );
    } catch (caught) {
      if (caught instanceof ApiError) setMissing((caught.payload as PublishError | null)?.missingHeadings ?? []);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!template) return error ? <p className={styles.error}>{error}</p> : <p>Loading the README template…</p>;

  return (
    <form onSubmit={submit}>
      <div className={styles.layout}>
        <div>
          <p className={styles.hint}>
            Fill in every section of the template. The comments are hints and are not published.
          </p>
          <CodeView value={readme} onChange={setReadme} language="markdown" height={420} />
        </div>
        <aside className={styles.required}>
          <h3>Required headings</h3>
          <ul>
            {template.requiredHeadings.map((heading) => (
              <li key={heading} className={missing.includes(heading) ? styles.missing : undefined}>
                {heading}
                {missing.includes(heading) && <span> — missing or empty</span>}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <label className={styles.field}>
        <span>
          <strong>Example input</strong> (JSON). The Starter snippet starts the workflow with it, so use values that
          make the activity succeed. The keys are the fields of the input type.
        </span>
        <textarea
          value={exampleInput}
          onChange={(event) => setExampleInput(event.target.value)}
          placeholder={EXAMPLE_INPUT_PLACEHOLDER}
          rows={6}
          spellCheck={false}
          required
        />
      </label>

      {newVersion && (
        <label className={`${styles.field} ${styles.version}`}>
          <span>
            <strong>Version</strong>. {suggestion.name}@{suggestion.previousVersion} is published, so this is a new
            version. Suggested: {suggestion.suggestedVersion}. Any x.y.z higher than {suggestion.previousVersion} is
            accepted.
          </span>
          <input value={version} onChange={(event) => setVersion(event.target.value)} spellCheck={false} required />
        </label>
      )}

      <div className={styles.actions}>
        <button type="submit" disabled={busy || exampleInput.trim() === "" || (newVersion && version.trim() === "")}>
          {busy ? "Publishing…" : "Publish"}
        </button>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </form>
  );
}
