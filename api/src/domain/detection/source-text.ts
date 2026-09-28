// Small text helpers shared by the per-SDK detectors. No SDK knowledge here.

/** Maps character offsets in a piece of source to 1-based line numbers. */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") this.starts.push(i + 1);
    }
  }

  lineAt(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }
}

/**
 * Given the offset of an opening bracket, returns the offset of its matching
 * closing bracket, skipping over quoted strings. Returns -1 if unbalanced.
 */
export function findClosingBracket(text: string, openOffset: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  let i = openOffset;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(text, i);
      continue;
    }
    if (pairs[ch]) {
      stack.push(pairs[ch]);
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Splits `text` on commas that are not nested in brackets or strings, keeping each part's offset. */
export function splitTopLevel(text: string, separator = ","): { part: string; offset: number }[] {
  const parts: { part: string; offset: number }[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(text, i);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === separator && depth === 0) {
      parts.push({ part: text.slice(start, i), offset: start });
      start = i + 1;
    }
    i++;
  }
  parts.push({ part: text.slice(start), offset: start });
  return parts;
}

/** Returns the offset just past the string literal that starts at `offset`. Handles triple quotes. */
export function skipString(text: string, offset: number): number {
  const quote = text[offset];
  const triple = text.startsWith(quote.repeat(3), offset);
  const delimiter = triple ? quote.repeat(3) : quote;
  let i = offset + delimiter.length;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text.startsWith(delimiter, i)) return i + delimiter.length;
    if (!triple && text[i] === "\n") return i; // unterminated single-line string
    i++;
  }
  return text.length;
}
