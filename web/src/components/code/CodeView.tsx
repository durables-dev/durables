import { Editor, loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import styles from "./CodeView.module.css";

// The only Monaco wrapper on the site. Monaco is bundled from the local
// package (its workers are picked up by Vite) rather than loaded from a CDN,
// so the demo runs offline.
loader.config({ monaco });

export type LineHighlight = { line: number; kind: "matched" | "cited" };

type CodeViewProps = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language?: string;
  height?: number | string;
  highlights?: LineHighlight[];
};

export function CodeView({ value, onChange, readOnly = false, language = "python", height = 420, highlights = [] }: CodeViewProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  const applyHighlights = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const decorations = highlights.map(({ line, kind }) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: kind === "matched" ? styles.matchedLine : styles.citedLine,
        linesDecorationsClassName: kind === "matched" ? styles.matchedGutter : styles.citedGutter,
      },
    }));
    decorationsRef.current?.clear();
    decorationsRef.current = editor.createDecorationsCollection(decorations);
    if (highlights.length > 0) editor.revealLineInCenter(highlights[0].line);
  };

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    applyHighlights();
  };

  useEffect(applyHighlights, [highlights]);

  return (
    <div className={styles.frame}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(next) => onChange?.(next ?? "")}
        onMount={handleMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          stickyScroll: { enabled: false },
          lineNumbers: "on",
          renderLineHighlight: readOnly ? "none" : "line",
        }}
      />
    </div>
  );
}
