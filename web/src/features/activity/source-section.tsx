import { CodeBlock } from "@/components/code-block";
import type { VersionResponse } from "./listing-queries";
import { sdkLanguage } from "./sdk-language";
import { sourceCaption } from "./source-caption";
import styles from "./source-section.module.css";

export interface SourceSectionProps {
  /** The published code, exactly as published. It is shown unchanged. */
  code: string;
  /** The Implement activity file name, such as activities.py. */
  activityFileName: string;
  sdk: VersionResponse["sdk"];
}

// The Source section: the published code in the shared code block, headed with the
// Implement activity file name and the line count. The code is never reindented (DUR-2 rule 1).
export function SourceSection({
  code,
  activityFileName,
  sdk,
}: SourceSectionProps) {
  return (
    <>
      <h2 className={styles["title"]}>Source</h2>
      <CodeBlock
        code={code}
        language={sdkLanguage(sdk)}
        label="published code"
        caption={sourceCaption(activityFileName, code)}
      />
    </>
  );
}
