import {
  useId,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { lineCount } from "./line-count";
import styles from "./paste-editor.module.css";
import { useCheckRequest } from "./use-check-request";

export interface PasteEditorProps {
  /** The code in the editor, exactly as pasted. */
  value: string;
  /** Called with the new code on every change. */
  onChange: (code: string) => void;
  /** Called when the code should be checked: on paste, and once typing pauses. */
  onCheck: (code: string) => void;
}

/** The editor is never shorter than this many lines. */
const minRows = 24;
/** The editor grows with the code up to this many lines, then scrolls. */
const maxRows = 40;
/** What Tab types. Pasted tabs are kept; they display this wide. */
const indent = "    ";

// The paste editor: a plain textarea with a line-number gutter at its left. The code is kept
// exactly as pasted. The gutter is a separate column that follows the textarea's vertical
// scroll, so sideways scrolling leaves it in place. It is hidden from assistive technology.
export function PasteEditor({ value, onChange, onCheck }: PasteEditorProps) {
  const id = useId();
  const gutter = useRef<HTMLDivElement>(null);
  const check = useCheckRequest(onCheck);
  const lines = lineCount(value);
  const numbers = Array.from({ length: lines }, (_, at) => at + 1).join("\n");
  // The gutter is as wide as its longest number, and never narrower than two digits.
  const gutterWidth = {
    "--gutter-digits": Math.max(2, String(lines).length),
  } as CSSProperties;

  function edited(code: string, pasted: boolean) {
    onChange(code);
    if (pasted) {
      check.now(code);
    } else {
      check.afterPause(code);
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const { inputType } = event.nativeEvent as Partial<InputEvent>;
    edited(
      event.currentTarget.value,
      inputType?.startsWith("insertFromPaste") === true,
    );
  }

  // A paste that leaves the text as it was, such as the same file pasted again to retry a
  // check, changes nothing, so the editor reports no change. It is still a paste, so once the
  // browser has finished pasting it asks for a check of the unchanged text.
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const editor = event.currentTarget;
    const before = editor.value;
    window.setTimeout(() => {
      if (editor.value === before) check.now(before);
    }, 0);
  }

  // Tab types four spaces in place of the selection. Shift+Tab still moves focus back out.
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
    const editor = event.currentTarget;
    editor.setRangeText(
      indent,
      editor.selectionStart,
      editor.selectionEnd,
      "end",
    );
    edited(editor.value, false);
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
        <div
          ref={gutter}
          aria-hidden="true"
          className={styles["gutter"]}
          style={gutterWidth}
        >
          {numbers}
        </div>
        <textarea
          id={id}
          name="code"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          rows={Math.min(Math.max(lines, minRows), maxRows)}
          wrap="off"
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          placeholder="Paste a single-file Temporal activity"
          className={styles["code"]}
        />
      </div>
    </div>
  );
}
