import { Fragment, Suspense, use, useState } from "react";
import {
  codeLanguage,
  highlighter as sharedHighlighter,
  type CodeLanguage,
  type HighlightedToken,
  type Highlighter,
} from "@/lib/highlighter";
import styles from "./code-block.module.css";

export const COPY_FAILED_MESSAGE =
  "Couldn't copy the code. Select it and copy it yourself.";

export interface CodeBlockProps {
  /** The code. It is shown exactly as given, never reindented or rewritten. */
  code: string;
  /** "python", "typescript" or "csharp". Any other value, or none, shows plain text. */
  language?: string | undefined;
  /**
   * What the code is, such as "install command". It names the copy button
   * ("Copy install command") and the scrolling code region.
   */
  label: string;
  /** Defaults to the app's shared highlighter. Tests pass their own. */
  highlighter?: Highlighter;
}

interface CopyResult {
  outcome: "copied" | "failed";
  /** The code the outcome belongs to, so a new `code` starts with an empty status. */
  code: string;
}

// Every block of code on the site (web/CONVENTIONS.md, Code display): line numbers, a
// copy button and a "Copied" status region. The code is plain until its language's
// grammar has loaded, then coloured.
export function CodeBlock({
  code,
  language,
  label,
  highlighter = sharedHighlighter,
}: CodeBlockProps) {
  const [copy, setCopy] = useState<CopyResult | null>(null);
  const lines = code.split("\n");
  const known = codeLanguage(language);
  const outcome = copy?.code === code ? copy.outcome : undefined;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopy({ outcome: "copied", code });
    } catch {
      setCopy({ outcome: "failed", code });
    }
  }

  const plain = <CodeLines lines={lines} />;

  return (
    <div className={styles["block"]}>
      <div className={styles["toolbar"]}>
        <p role="status" className={styles["status"]}>
          {outcome === "copied" && "Copied"}
          {outcome === "failed" && COPY_FAILED_MESSAGE}
        </p>
        <button
          type="button"
          className={styles["copy"]}
          aria-label={`Copy ${label}`}
          onClick={() => void copyCode()}
        >
          Copy
        </button>
      </div>
      <div
        className={styles["scroller"]}
        role="region"
        aria-label={label}
        // Long lines scroll sideways and the region holds nothing focusable, so it takes
        // focus itself for keyboard scrolling (WCAG 2.1.1, axe scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above.
        tabIndex={0}
      >
        <div className={styles["gutter"]} aria-hidden="true">
          {lines.map((_line, index) => (
            <span key={index} className={styles["number"]}>
              {index + 1}
            </span>
          ))}
        </div>
        <pre className={styles["code"]}>
          <code>
            {known ? (
              <Suspense fallback={plain}>
                <HighlightedLines
                  code={code}
                  lines={lines}
                  language={known}
                  highlighter={highlighter}
                />
              </Suspense>
            ) : (
              plain
            )}
          </code>
        </pre>
      </div>
    </div>
  );
}

interface HighlightedLinesProps {
  code: string;
  lines: string[];
  language: CodeLanguage;
  highlighter: Highlighter;
}

function HighlightedLines({
  code,
  lines,
  language,
  highlighter,
}: HighlightedLinesProps) {
  const ready = use(highlighter.load(language));
  const tokens = ready ? highlighter.highlight(code, language) : undefined;
  return <CodeLines lines={lines} tokens={tokens} />;
}

interface CodeLinesProps {
  lines: string[];
  tokens?: HighlightedToken[][] | undefined;
}

// Lines are joined by "\n" text nodes, so the code element's text is exactly the input.
// A line is coloured only when its tokens rejoin to exactly that line; otherwise it is
// shown as given.
function CodeLines({ lines, tokens }: CodeLinesProps) {
  return lines.map((line, index) => {
    const lineTokens = tokens?.[index];
    const exact =
      lineTokens?.map((token) => token.content).join("") === line
        ? lineTokens
        : undefined;
    return (
      <Fragment key={index}>
        {index > 0 && "\n"}
        <span className={styles["line"]}>
          {exact
            ? exact.map((token, at) =>
                token.color ? (
                  <span key={at} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ) : (
                  token.content
                ),
              )
            : line}
        </span>
      </Fragment>
    );
  });
}
