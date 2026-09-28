import { useState } from "react";
import type { Check, Detection } from "../api/types";
import { Panel } from "../components/Panel";
import { DeclarationForm } from "../features/declaration-form/DeclarationForm";
import { DetectionPanel } from "../features/detection-panel/DetectionPanel";
import { CheckResults } from "../features/evaluation-report/CheckResults";
import { PasteEditor } from "../features/paste-editor/PasteEditor";

// Nothing is stored before publish: the browser holds the pasted code, the
// detection result and the checks until POC-5's publish step.

type Detected = { code: string; detection: Detection; attempt: number };

export function PublishPage() {
  const [detected, setDetected] = useState<Detected | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);

  return (
    <>
      <h1>Publish an activity</h1>
      <Panel step={1} title="Paste your activity">
        <PasteEditor
          onDetected={(code, detection) => {
            setDetected((previous) => ({ code, detection, attempt: (previous?.attempt ?? 0) + 1 }));
            setChecks(null);
          }}
        />
      </Panel>
      {detected && (
        <Panel step={1} title="What detection found">
          <DetectionPanel detection={detected.detection} />
        </Panel>
      )}
      {detected && (
        <Panel step={2} title="Declare what detection couldn't find">
          <DeclarationForm
            key={detected.attempt}
            code={detected.code}
            detection={detected.detection}
            onChecked={(_declarations, result) => setChecks(result)}
          />
        </Panel>
      )}
      {detected && checks && (
        <Panel step={3} title="Pattern check">
          <CheckResults code={detected.code} checks={checks} />
        </Panel>
      )}
    </>
  );
}
