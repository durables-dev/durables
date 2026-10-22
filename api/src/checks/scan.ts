import type { NamedLineRef } from "./facts";
import type { Pattern } from "./pattern";

// Helpers the per-SDK detectors share for reading pasted code. Nothing here is a detection
// pattern; the patterns live with each SDK's detector.

/**
 * Every match of a pattern in the text, in order. Extra flags, such as `d` for match indices,
 * are added to the pattern's own.
 */
export const allMatches = (pattern: Pattern, text: string, flags = "") => [
  ...text.matchAll(
    new RegExp(pattern.regex.source, `${pattern.regex.flags}${flags}g`),
  ),
];

/** A stretch of the text, from `start` up to but not including `end`. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Whether an offset falls inside one of the spans, which are in order and don't overlap. */
export const isInside = (spans: readonly Span[], offset: number) => {
  let low = 0;
  let high = spans.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const span = spans[middle];
    if (span === undefined) {
      return false;
    }
    if (offset < span.start) {
      high = middle - 1;
    } else if (offset >= span.end) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
};

/** The 1-based line number of an offset in the text. */
export type LineOf = (offset: number) => number;

/**
 * Numbers lines the way `lineAt` does, from an index of line starts built once, so that a file
 * with many matches is not rescanned from the top for each one.
 */
export const lineFinder = (text: string): LineOf => {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low + 1;
  };
};

/**
 * For each offset of the text, the offset of the innermost open bracket around it, or -1. Built
 * in one pass over the code, skipping the ignored spans (comments and strings), so brackets
 * inside them don't count. A closing bracket is enclosed by the bracket it closes.
 */
export const enclosingBrackets = (text: string, ignored: readonly Span[]) => {
  const enclosing = new Int32Array(text.length).fill(-1);
  const open: number[] = [];
  let next = 0;
  for (let i = 0; i < text.length; i++) {
    const span = ignored[next];
    if (span !== undefined && i >= span.start) {
      i = span.end - 1;
      next++;
      continue;
    }
    const character = text[i] ?? "";
    enclosing[i] = open[open.length - 1] ?? -1;
    if ("([{".includes(character)) {
      open.push(i);
    } else if (")]}".includes(character)) {
      open.pop();
    }
  }
  return enclosing;
};

/** Keeps the first entry for each name. */
export const firstByName = (found: readonly NamedLineRef[]) => {
  const seen = new Set<string>();
  return found.filter(({ name }) => {
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
};
