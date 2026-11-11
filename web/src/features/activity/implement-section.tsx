import { CodeBlock } from "@/components/code-block";
import type { CodeLanguage } from "@/lib/highlighter";
import { sdkLanguage } from "@/lib/sdk-language";
import { useId, useState, type KeyboardEvent } from "react";
import {
  implementSteps,
  type ImplementFile,
  type ImplementVersion,
} from "./implement-steps";
import styles from "./implement-section.module.css";
import type { VersionResponse } from "./listing-queries";

export interface ImplementSectionProps {
  /** The version: its address, published code, activity file name and Implement snippets. */
  version: ImplementVersion;
  sdk: VersionResponse["sdk"];
}

// The Implement section: install the dependencies, add the four files, then run them. Every
// block is the shared code block, so each has line numbers and Copy, and none is reindented.
export function ImplementSection({ version, sdk }: ImplementSectionProps) {
  const { installCommand, files, runCommands } = implementSteps(version);
  const language = sdkLanguage(sdk);

  return (
    <>
      <h2 className={styles["title"]}>Implement</h2>
      <div className={styles["step"]}>
        <h3 className={styles["heading"]}>1. Install the dependencies</h3>
        {installCommand === undefined ? null : (
          <CodeBlock code={installCommand} label="install command" />
        )}
      </div>
      <div className={styles["step"]}>
        <h3 className={styles["heading"]}>
          2. Add these four files to your project
        </h3>
        <FileTabs files={files} language={language} />
      </div>
      <div className={styles["step"]}>
        <h3 className={styles["heading"]}>3. Run it</h3>
        {runCommands === undefined ? null : (
          <CodeBlock code={runCommands} label="run commands" />
        )}
      </div>
    </>
  );
}

interface FileTabsProps {
  files: ImplementFile[];
  language: CodeLanguage;
}

// The files as tabs, the activity file first and selected. Arrow keys, Home and End move
// between tabs, and only the selected tab is in the tab order.
function FileTabs({ files, language }: FileTabsProps) {
  const [selectedName, setSelectedName] = useState<string | undefined>();
  const baseId = useId();
  const selected = files.find((file) => file.name === selectedName) ?? files[0];

  if (selected === undefined) return null;

  const tabId = (index: number) => `${baseId}-tab-${String(index)}`;
  const panelId = `${baseId}-panel`;
  const selectedIndex = files.indexOf(selected);

  function moveTo(index: number) {
    const file = files[index];
    if (file === undefined) return;
    setSelectedName(file.name);
    document.getElementById(tabId(index))?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = files.length - 1;
    const next = {
      ArrowRight: selectedIndex === last ? 0 : selectedIndex + 1,
      ArrowLeft: selectedIndex === 0 ? last : selectedIndex - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    moveTo(next);
  }

  return (
    <>
      <div role="tablist" aria-label="Files" className={styles["tabs"]}>
        {files.map((file, index) => {
          const isSelected = file === selected;
          return (
            <button
              key={file.name}
              id={tabId(index)}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={isSelected ? panelId : undefined}
              tabIndex={isSelected ? 0 : -1}
              className={styles["tab"]}
              onKeyDown={onKeyDown}
              onClick={() => {
                setSelectedName(file.name);
              }}
            >
              {file.name}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(selectedIndex)}
        className={styles["panel"]}
      >
        <p className={styles["description"]}>{selected.description}</p>
        <CodeBlock
          code={selected.code}
          language={language}
          label={selected.name}
        />
      </div>
    </>
  );
}
