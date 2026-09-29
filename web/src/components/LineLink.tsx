import styles from "./LineLink.module.css";

/** An evidence link: "line 37", which shows the code with that line highlighted. */
export function LineLink({ line, onClick }: { line: number; onClick(): void }) {
  return (
    <button type="button" className={styles.lineLink} onClick={onClick}>
      line {line}
    </button>
  );
}
