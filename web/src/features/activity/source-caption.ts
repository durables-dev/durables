import { codeLines } from "@/lib/code-lines";

/**
 * The Source block's heading: the Implement activity file name and the line count, such as
 * "activities.py · 42 lines". The count is the number of line numbers the block shows.
 */
export function sourceCaption(fileName: string, code: string): string {
  const count = codeLines(code).length;
  return `${fileName} · ${String(count)} ${count === 1 ? "line" : "lines"}`;
}
