import { useState, type FormEvent } from "react";
import { detectActivity } from "../../api/activities";
import type { Detection } from "../../api/types";
import { CodeView } from "../../components/code/CodeView";
import styles from "./PasteEditor.module.css";

type PasteEditorProps = {
  onDetected(code: string, detection: Detection): void;
};

/** Step 1: paste a single-file activity and submit it for detection. No manifest. */
export function PasteEditor({ onDetected }: PasteEditorProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDetected(code, await detectActivity(code));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className={styles.hint}>Paste one activity file. Durables works out the rest; no manifest needed.</p>
      <CodeView value={code} onChange={setCode} height={460} />
      <div className={styles.actions}>
        <button type="submit" disabled={busy || code.trim() === ""}>
          {busy ? "Detecting…" : "Submit"}
        </button>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </form>
  );
}
