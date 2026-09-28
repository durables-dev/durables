import type { GroupListing } from "../../api/types";
import { CodeView } from "../../components/code/CodeView";
import { CopyButton } from "../../components/CopyButton";
import styles from "./GroupFile.module.css";

const LINE_HEIGHT = 19;

/** The whole group file, read-only, with a copy button that copies exactly what api generated. */
export function GroupFile({ listing }: { listing: GroupListing }) {
  return (
    <>
      <div className={styles.bar}>
        <span className={styles.filename}>
          Save as <code>{listing.filename}</code>
        </span>
        <CopyButton text={listing.file} label="Copy file" />
      </div>
      <CodeView
        value={listing.file}
        readOnly
        language="python"
        height={Math.min(720, listing.file.split("\n").length * LINE_HEIGHT + 16)}
      />
    </>
  );
}
