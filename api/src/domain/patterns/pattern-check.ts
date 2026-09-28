import type { RubricEntry } from "../../model/rubric.js";

/** Returns the cited lines (1-based) whose text matches at least one of the entry's patterns, in citation order. */
export function matchCitedLines(code: string, citedLines: number[], entry: RubricEntry): number[] {
  const sourceLines = code.split(/\r?\n/);
  const patterns = entry.patterns.map((source) => new RegExp(source));
  return [...new Set(citedLines)].filter((line) => {
    const text = sourceLines[line - 1];
    return text !== undefined && patterns.some((pattern) => pattern.test(text));
  });
}
