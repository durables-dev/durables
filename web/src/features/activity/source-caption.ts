import { codeLines } from "@/lib/code-lines";

/**
 * The Source block's heading: the Implement activity file name and the line count, such as
 * "activities.py · 42 lines". The count is the file's lines as a reader counts them: a line
 * break at the very end of the file does not start another line. The block's gutter still
 * numbers that empty last line, so the count can be one less than the last line number.
 */
export function sourceCaption(fileName: string, code: string): string {
  const lines = codeLines(code);
  const count =
    lines.length > 1 && lines.at(-1) === "" ? lines.length - 1 : lines.length;
  return `${fileName} · ${String(count)} ${count === 1 ? "line" : "lines"}`;
}
