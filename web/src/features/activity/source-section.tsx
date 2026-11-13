import { CodeBlock } from "@/components/code-block";
import { useSdkProfile } from "@/lib/use-sdk-profile";
import { sourceCaption } from "./source-caption";
import styles from "./source-section.module.css";

export interface SourceSectionProps {
  /** The published code, exactly as published. It is shown unchanged. */
  code: string;
  /** The Implement activity file name, such as activities.py. */
  activityFileName: string;
  /** The activity's SDK, named as the api names it. Its catalog profile picks the highlighting. */
  sdk: string;
}

// The Source section: the published code in the shared code block, headed with the
// Implement activity file name and the line count. The code is never reindented (DUR-2 rule 1).
// It is highlighted in the language the SDK catalog names, and is plain text without one.
export function SourceSection({
  code,
  activityFileName,
  sdk,
}: SourceSectionProps) {
  const profile = useSdkProfile(sdk);
  return (
    <>
      <h2 className={styles["title"]}>Source</h2>
      <CodeBlock
        code={code}
        language={profile?.highlightLanguage}
        label="published code"
        caption={sourceCaption(activityFileName, code)}
      />
    </>
  );
}
