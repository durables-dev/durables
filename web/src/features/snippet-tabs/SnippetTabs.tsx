import { useState } from "react";
import type { Snippet } from "../../api/types";
import { CodeView } from "../../components/code/CodeView";
import { CopyButton } from "../../components/CopyButton";
import { Tabs } from "../../components/Tabs";
import styles from "./SnippetTabs.module.css";

const TAB_LABELS: Record<Snippet["tab"], string> = {
  install: "Install",
  activity: "Activity",
  workflow: "Workflow",
  worker: "Worker",
  starter: "Starter",
};

const LINE_HEIGHT = 19;

/** The listing's snippet block: one tab per snippet, each with a copy button that copies exactly what api generated. */
export function SnippetTabs({ snippets }: { snippets: Snippet[] }) {
  const [selected, setSelected] = useState<Snippet["tab"]>(snippets[0]?.tab ?? "install");
  const snippet = snippets.find((s) => s.tab === selected) ?? snippets[0];
  if (!snippet) return null;

  return (
    <Tabs
      tabs={snippets.map((s) => ({ id: s.tab, label: TAB_LABELS[s.tab] }))}
      selected={snippet.tab}
      onSelect={(id) => setSelected(id as Snippet["tab"])}
      actions={<CopyButton text={snippet.content} />}
    >
      {snippet.language === "shell" ? (
        <pre className={styles.command}>
          <code>{snippet.content}</code>
        </pre>
      ) : (
        <>
          {snippet.filename && (
            <p className={styles.filename}>
              Save as <code>{snippet.filename}</code>
            </p>
          )}
          <CodeView
            key={snippet.tab}
            value={snippet.content}
            readOnly
            language={snippet.language}
            height={Math.min(520, snippet.content.split("\n").length * LINE_HEIGHT + 16)}
          />
        </>
      )}
    </Tabs>
  );
}
