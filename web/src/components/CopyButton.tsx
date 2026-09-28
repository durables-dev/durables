import { useEffect, useState } from "react";
import styles from "./CopyButton.module.css";

/** Copies `text` to the clipboard exactly as given, and says so for a moment. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <button type="button" className={styles.button} onClick={copy} aria-label={`${label} to clipboard`}>
      {copied ? "Copied" : label}
    </button>
  );
}
