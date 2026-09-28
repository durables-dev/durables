import { useState, type FormEvent } from "react";
import { checkActivity } from "../../api/activities";
import type { Check, Declarations, Detection, TagStatus } from "../../api/types";
import { parseLineNumbers } from "../../lib/line-numbers";
import styles from "./DeclarationForm.module.css";

type DeclarationFormProps = {
  code: string;
  detection: Detection;
  onChecked(declarations: Declarations, checks: Check[]): void;
};

const STATUS_LABELS: Record<TagStatus, string> = {
  present: "Yes",
  absent: "No",
  "not-applicable": "Not applicable",
};

/** Step 2: ask what detection can't answer, then send it for the pattern check (step 3). */
export function DeclarationForm({ code, detection, onChecked }: DeclarationFormProps) {
  const [idempotencyStatus, setIdempotencyStatus] = useState<TagStatus | "">("");
  const [idempotencyLines, setIdempotencyLines] = useState("");
  const [compensationStatus, setCompensationStatus] = useState<TagStatus | "">("");
  const [compensationAddress, setCompensationAddress] = useState("");
  const [heartbeatStatus, setHeartbeatStatus] = useState<TagStatus | "">("");
  const [heartbeatReason, setHeartbeatReason] = useState("");
  const [purposes, setPurposes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = idempotencyStatus !== "" && compensationStatus !== "" && heartbeatStatus !== "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!complete) return;
    const declarations: Declarations = {
      idempotency: {
        status: idempotencyStatus,
        lines: idempotencyStatus === "present" ? parseLineNumbers(idempotencyLines) : [],
      },
      compensation:
        compensationStatus === "present"
          ? { status: compensationStatus, address: compensationAddress.trim() }
          : { status: compensationStatus },
      heartbeat:
        heartbeatStatus === "not-applicable"
          ? { status: heartbeatStatus, reason: heartbeatReason.trim() }
          : { status: heartbeatStatus },
      envVars: detection.envVars.map(({ value }) => ({ name: value, purpose: (purposes[value] ?? "").trim() })),
    };
    setBusy(true);
    setError(null);
    try {
      onChecked(declarations, await checkActivity(code, declarations));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset>
        <legend>Idempotency</legend>
        <StatusChoice name="idempotency" label="Is this activity idempotent?" value={idempotencyStatus} onChange={setIdempotencyStatus} />
        {idempotencyStatus === "present" && (
          <label className={styles.field}>
            <span>Line numbers that send the idempotency key</span>
            <input
              value={idempotencyLines}
              onChange={(event) => setIdempotencyLines(event.target.value)}
              placeholder="e.g. 37 or 36-38"
              required
            />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Compensation</legend>
        <StatusChoice name="compensation" label="Does it have a compensating activity?" value={compensationStatus} onChange={setCompensationStatus} />
        {compensationStatus === "present" && (
          <label className={styles.field}>
            <span>Compensation address</span>
            <input
              value={compensationAddress}
              onChange={(event) => setCompensationAddress(event.target.value)}
              placeholder="durables.dev/<owner>/<name>"
              required
            />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Heartbeating</legend>
        <StatusChoice name="heartbeat" label="Does it heartbeat?" value={heartbeatStatus} onChange={setHeartbeatStatus} />
        {heartbeatStatus === "not-applicable" && (
          <label className={styles.field}>
            <span>Why heartbeating doesn't apply</span>
            <input value={heartbeatReason} onChange={(event) => setHeartbeatReason(event.target.value)} required />
          </label>
        )}
      </fieldset>

      {detection.envVars.length > 0 && (
        <fieldset>
          <legend>Environment variables</legend>
          {detection.envVars.map(({ value }) => (
            <label key={value} className={styles.field}>
              <span>
                Purpose of <code>{value}</code>
              </span>
              <input
                value={purposes[value] ?? ""}
                onChange={(event) => setPurposes({ ...purposes, [value]: event.target.value })}
                placeholder="One line"
                required
              />
            </label>
          ))}
        </fieldset>
      )}

      <div className={styles.actions}>
        <button type="submit" disabled={busy || !complete}>
          {busy ? "Checking…" : "Check declarations"}
        </button>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </form>
  );
}

type StatusChoiceProps = {
  name: string;
  label: string;
  value: TagStatus | "";
  onChange(status: TagStatus): void;
};

function StatusChoice({ name, label, value, onChange }: StatusChoiceProps) {
  return (
    <div className={styles.choice} role="radiogroup" aria-label={label}>
      <span>{label}</span>
      {(Object.keys(STATUS_LABELS) as TagStatus[]).map((status) => (
        <label key={status}>
          <input type="radio" name={name} checked={value === status} onChange={() => onChange(status)} />{" "}
          {STATUS_LABELS[status]}
        </label>
      ))}
    </div>
  );
}
