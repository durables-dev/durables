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

/**
 * Splits `text` on commas that are not nested in brackets or strings, keeping each part's offset.
 * With `angles`, `<…>` nests too (TypeScript and C# generics), and the `>` of `=>` is not a bracket.
 */
export function splitTopLevel(
  text: string,
  separator = ",",
  { angles = false }: { angles?: boolean } = {},
): { part: string; offset: number }[] {
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
    if (ch === "(" || ch === "[" || ch === "{" || (angles && ch === "<")) depth++;
    else if (ch === ")" || ch === "]" || ch === "}" || (angles && ch === ">" && text[i - 1] !== "=")) depth--;
    else if (ch === separator && depth === 0) {
      parts.push({ part: text.slice(start, i), offset: start });
      start = i + 1;
    }
    i++;
  }
  parts.push({ part: text.slice(start), offset: start });
  return parts;
}

/** Returns the offset just past the string literal that starts at `offset`. Handles triple quotes and multi-line template literals. */
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
    // An unterminated single-line string. Template literals (backticks) may span lines.
    if (!triple && quote !== "`" && text[i] === "\n") return i;
    i++;
  }
  return text.length;
}

/**
 * Blanks out `//` and `/* … *\/` comments (outside string literals) in TypeScript
 * or C# source, so commented-out code is not detected. Keeps offsets and newlines.
 */
export function maskSlashComments(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(code, i);
      out += code.slice(i, end);
      i = end;
    } else if (ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Collapses runs of whitespace to one space and trims. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Runs a global copy of `pattern` from `from`, returning the first match at or after it. */
export function execFrom(pattern: RegExp, text: string, from: number): RegExpExecArray | null {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  global.lastIndex = from;
  return global.exec(text);
}
