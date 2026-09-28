import { useState } from "react";
import { useNavigate } from "react-router";
import type { Check, Declarations, Detection } from "../api/types";
import { Panel } from "../components/Panel";
import { DeclarationForm } from "../features/declaration-form/DeclarationForm";
import { DetectionPanel } from "../features/detection-panel/DetectionPanel";
import { CheckResults } from "../features/evaluation-report/CheckResults";
import { PasteEditor } from "../features/paste-editor/PasteEditor";
import { ReadmeEditor } from "../features/readme-editor/ReadmeEditor";
import { listingPath } from "../lib/address";

// Nothing is stored before publish: the browser holds the pasted code, the
// declarations and the checks until step 4 publishes them. api re-runs
// detection and the checks itself when it publishes.

type Detected = { code: string; detection: Detection; attempt: number };

export function PublishPage() {
  const [detected, setDetected] = useState<Detected | null>(null);
  const [checked, setChecked] = useState<{ declarations: Declarations; checks: Check[] } | null>(null);
  const navigate = useNavigate();

  return (
    <>
      <h1>Publish an activity</h1>
      <Panel step={1} title="Paste your activity">
        <PasteEditor
          onDetected={(code, detection) => {
            setDetected((previous) => ({ code, detection, attempt: (previous?.attempt ?? 0) + 1 }));
            setChecked(null);
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
            onChecked={(declarations, checks) => setChecked({ declarations, checks })}
          />
        </Panel>
      )}
      {detected && checked && (
        <Panel step={3} title="Pattern check">
          <CheckResults code={detected.code} checks={checked.checks} linksInNewTab />
        </Panel>
      )}
      {detected && checked && (
        <Panel step={4} title="Write the README and publish">
          <ReadmeEditor
            code={detected.code}
            declarations={checked.declarations}
            onPublished={(result) => navigate(listingPath(result.owner, result.name, result.version))}
          />
        </Panel>
      )}
    </>
  );
}
