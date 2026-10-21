import {
  useId,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { lineCount, lineNumbers } from "./line-count";
import { useCheckRequest } from "./use-check-request";
import styles from "./paste-editor.module.css";

/** The editor is never shorter than this many lines. */
export const MIN_ROWS = 24;

/** What the Tab key types. */
const INDENT = "    ";

export interface PasteEditorProps {
  /** The code, exactly as pasted or typed. */
  value: string;
  /** Called with the new code on every change. */
  onChange: (code: string) => void;
  /** Called with the code when it should be checked: on paste, and after a pause in typing. */
  onCheck: (code: string) => void;
  /** The field's name in its form. */
  name?: string | undefined;
}

// The paste step's editor (web/CONVENTIONS.md, Forms): a plain textarea with a line-number
// gutter kept in step with its scroll position. The code is never rewritten; tabs stay
// tabs and display four spaces wide.
export function PasteEditor({
  value,
  onChange,
  onCheck,
  name,
}: PasteEditorProps) {
  const id = useId();
  const gutter = useRef<HTMLDivElement>(null);
  const check = useCheckRequest(onCheck);

  function report(code: string, pasted: boolean) {
    onChange(code);
    if (pasted) {
      check.now(code);
    } else {
      check.afterPause(code);
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const input = event.nativeEvent;
    const pasted =
      "inputType" in input && input.inputType === "insertFromPaste";
    report(event.currentTarget.value, pasted);
  }

  // Tab types four spaces in place of the selection. Shift+Tab still moves focus, so the
  // editor never traps a keyboard user.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Tab" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    event.preventDefault();
    const field = event.currentTarget;
    field.setRangeText(INDENT, field.selectionStart, field.selectionEnd, "end");
    report(field.value, false);
  }

  function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (gutter.current) {
      gutter.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  return (
    <div className={styles["field"]}>
      <label htmlFor={id} className={styles["label"]}>
        Paste your file
      </label>
      <div className={styles["panel"]}>
        <div ref={gutter} className={styles["gutter"]} aria-hidden="true">
          {lineNumbers(value)}
        </div>
        <textarea
          id={id}
          name={name}
          className={styles["code"]}
          value={value}
          rows={Math.max(MIN_ROWS, lineCount(value))}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          placeholder="Paste a single-file Temporal activity"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
        />
      </div>
    </div>
  );
}
