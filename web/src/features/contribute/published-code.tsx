import { CodeBlock } from "@/components/code-block";
import { sdkLanguage } from "@/lib/sdk-language";
import { useId, useRef, useState } from "react";
import type { CheckedFacts } from "./check-result";
import styles from "./published-code.module.css";

export interface PublishedCodeProps {
  /** The accepted file, exactly as pasted. */
  code: string;
  /** The SDK detection found, which picks the highlighting. */
  sdk: CheckedFacts["sdk"];
}

// "View what will be published" and the read-only dialog it opens. The dialog is a native
// <dialog> opened with showModal(), so the page behind it is inert and the code cannot change
// while it is open. It shows the whole file through the shared code block, unchanged. The
// close button and Escape both close it, and focus goes back to the button that opened it.
// The code block renders only while the dialog is open, so the highlighter loads on first use.
export function PublishedCode({ code, sdk }: PublishedCodeProps) {
  const titleId = useId();
  const subtitleId = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function openDialog() {
    setOpen(true);
    dialog.current?.showModal();
  }

  // Runs however the dialog closed: the close button, or Escape.
  function handleClose() {
    setOpen(false);
    opener.current?.focus();
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        className={styles["view"]}
        onClick={openDialog}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        View what will be published
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        className={styles["dialog"]}
        onClose={handleClose}
      >
        <div className={styles["header"]}>
          <div className={styles["titles"]}>
            <h2 id={titleId} className={styles["title"]}>
              What will be published
            </h2>
            <p id={subtitleId} className={styles["subtitle"]}>
              This is the code your listing will hold, exactly as you pasted it.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className={styles["close"]}
            onClick={() => {
              dialog.current?.close();
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {open ? (
          <div className={styles["body"]}>
            <CodeBlock
              code={code}
              language={sdkLanguage(sdk)}
              label="code that will be published"
            />
          </div>
        ) : null}
        <p className={styles["note"]}>Read-only.</p>
      </dialog>
    </>
  );
}
