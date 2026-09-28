import { Editor, loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import styles from "./CodeView.module.css";

// The only Monaco wrapper on the site. Monaco is bundled from the local
// package (its workers are picked up by Vite) rather than loaded from a CDN,
// so the demo runs offline.
loader.config({ monaco });

export type LineHighlight = { line: number; kind: "matched" | "cited" };

/** 1-based, inclusive whole lines. */
export type ReadOnlyRange = { startLine: number; endLine: number };

export type CodeMarker = { line: number; message: string; severity?: "error" | "warning" };

type CodeViewProps = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language?: string;
  height?: number | string;
  highlights?: LineHighlight[];
  /**
   * Whole-line ranges of `value` that refuse every edit. Pass a new array only
   * together with the `value` it refers to; the editor tracks the ranges
   * itself as the text around them is edited.
   */
  readOnlyRanges?: ReadOnlyRange[];
  /** Shown as squiggles on their lines, with the message on hover. */
  markers?: CodeMarker[];
  /** When `value` is replaced from outside (not by typing), put the cursor on the last line. */
  cursorToEndOnReplace?: boolean;
};

type Snapshot = { text: string; ranges: ReadOnlyRange[]; selection: monaco.Selection | null };

const MARKER_OWNER = "durables";

export function CodeView({
  value,
  onChange,
  readOnly = false,
  language = "python",
  height = 420,
  highlights = [],
  readOnlyRanges,
  markers,
  cursorToEndOnReplace = false,
}: CodeViewProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const guardRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const guardTextsRef = useRef<string[]>([]);
  const snapshotRef = useRef<Snapshot | null>(null);
  const suppressRef = useRef(false);
  const valueRef = useRef(value);
  const emittedRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

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

  // Read-only ranges are decorations that move with the text around them. The
  // decoration never grows when typing at its edges, so a new line can be
  // started just above or below a block. After every edit, each range's lines
  // must still read exactly as before; if not, the edit is undone.
  const applyGuard = (ranges: ReadOnlyRange[]) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const valid = ranges.filter((r) => r.startLine >= 1 && r.endLine <= model.getLineCount() && r.startLine <= r.endLine);
    guardRef.current?.clear();
    guardRef.current = editor.createDecorationsCollection(
      valid.map((r) => ({
        range: new monaco.Range(r.startLine, 1, r.endLine, model.getLineMaxColumn(r.endLine)),
        options: {
          isWholeLine: true,
          className: styles.readOnlyLine,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })),
    );
    guardTextsRef.current = valid.map((r) => linesText(model, r));
    snapshotRef.current = { text: model.getValue(), ranges: valid, selection: editor.getSelection() };
  };

  const guardedRanges = (): ReadOnlyRange[] | null => {
    const model = editorRef.current?.getModel();
    const guard = guardRef.current;
    if (!model || !guard) return [];
    const ranges = guard.getRanges().map((r) => ({ startLine: r.startLineNumber, endLine: r.endLineNumber }));
    if (ranges.length !== guardTextsRef.current.length) return null;
    return ranges.every((r, i) => linesText(model, r) === guardTextsRef.current[i]) ? ranges : null;
  };

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    applyHighlights();
    if (readOnlyRanges) applyGuard(readOnlyRanges);
    applyMarkers();

    editor.onDidChangeModelContent(() => {
      if (suppressRef.current) return;
      const model = editor.getModel();
      if (!model) return;
      const text = model.getValue();
      // A replacement from the value prop, already in sync with the parent.
      if (text === valueRef.current) return;

      // A refused edit is reverted after the fact by restoring the last good
      // snapshot, which also clears the undo history.
      // POC-SHORTCUT: SC-014
      const ranges = guardedRanges();
      if (ranges === null && snapshotRef.current) {
        const snapshot = snapshotRef.current;
        suppressRef.current = true;
        model.setValue(snapshot.text);
        suppressRef.current = false;
        applyGuard(snapshot.ranges);
        if (snapshot.selection) editor.setSelection(snapshot.selection);
        return;
      }
      snapshotRef.current = { text, ranges: ranges ?? [], selection: editor.getSelection() };
      emittedRef.current = text;
      onChangeRef.current?.(text);
    });
    editor.onDidChangeCursorSelection(() => {
      if (snapshotRef.current && editor.getModel()?.getValue() === snapshotRef.current.text) {
        snapshotRef.current.selection = editor.getSelection();
      }
    });
  };

  const applyMarkers = () => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      (markers ?? [])
        .filter((m) => m.line >= 1 && m.line <= model.getLineCount())
        .map((m) => ({
          startLineNumber: m.line,
          startColumn: model.getLineFirstNonWhitespaceColumn(m.line) || 1,
          endLineNumber: m.line,
          endColumn: model.getLineMaxColumn(m.line),
          message: m.message,
          severity: m.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
        })),
    );
  };

  useEffect(applyHighlights, [highlights]);

  // The Editor child has already applied `value` by the time these run.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === emittedRef.current) return;
    emittedRef.current = value;
    if (cursorToEndOnReplace) {
      const model = editor.getModel();
      if (!model) return;
      const lastLine = model.getLineCount();
      editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
      editor.revealLine(lastLine);
    }
  }, [value, cursorToEndOnReplace]);

  useEffect(() => {
    if (readOnlyRanges) applyGuard(readOnlyRanges);
  }, [readOnlyRanges]);

  useEffect(applyMarkers, [markers]);

  return (
    <div className={styles.frame}>
      <Editor
        height={height}
        language={language}
        value={value}
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

function linesText(model: monaco.editor.ITextModel, range: ReadOnlyRange): string {
  return model.getValueInRange(new monaco.Range(range.startLine, 1, range.endLine, model.getLineMaxColumn(range.endLine)));
}
