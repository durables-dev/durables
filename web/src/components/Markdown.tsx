import ReactMarkdown from "react-markdown";
import styles from "./Markdown.module.css";

/** Renders publisher-written markdown. Raw HTML (including the template's comment hints) is dropped, not rendered. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown skipHtml>{children}</ReactMarkdown>
    </div>
  );
}
