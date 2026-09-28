// Import merging for Python groups: exact-line deduplication of top-level,
// single-line imports (POC-6 API map, "Import merging is exact-line
// deduplication"). Pure functions, no I/O.

/** A lifted import line, and whether a blank line separated it from the import before it in its file. */
export type LiftedImport = { text: string; breakBefore: boolean };

export type LiftedCode = {
  imports: LiftedImport[];
  /** The code with its lifted import lines removed and blank lines trimmed from both ends. */
  body: string[];
};

const SINGLE_LINE_IMPORT = /^(?:import[ \t]+\S|from[ \t]+\S+[ \t]+import[ \t]+\S)/;

/**
 * Lifts every top-level, single-line `import …` or `from … import …` line out
 * of an activity's code. Lines are matched by regex, not parsed.
 */
// POC-SHORTCUT: SC-011
export function liftImports(code: string): LiftedCode {
  const lines = code.replace(/\r\n?/g, "\n").split("\n");
  const imports: LiftedImport[] = [];
  const body: string[] = [];
  let blankSinceLastImport = false;

  for (const line of lines) {
    if (isSingleLineImport(line)) {
      imports.push({ text: line.trim(), breakBefore: imports.length > 0 && blankSinceLastImport });
      blankSinceLastImport = false;
      continue;
    }
    if (line.trim() === "") blankSinceLastImport = true;
    body.push(line);
  }

  while (body.length > 0 && body[0].trim() === "") body.shift();
  while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
  return { imports, body };
}

/**
 * Merges each block's imports, in block order: identical lines (compared after
 * trimming) are kept once, in first-seen order. A blank line between import
 * groups in the first file to use them is kept, so the header reads like the
 * activity's own imports. `from __future__` imports go first, as Python requires.
 */
export function mergeImports(perBlock: LiftedImport[][]): string[] {
  const seen = new Set<string>();
  const future: string[] = [];
  const merged: string[] = [];

  for (const imports of perBlock) {
    for (const { text, breakBefore } of imports) {
      if (seen.has(text)) continue;
      seen.add(text);
      if (/^from[ \t]+__future__[ \t]/.test(text)) {
        future.push(text);
        continue;
      }
      if (breakBefore && merged.length > 0 && merged[merged.length - 1] !== "") merged.push("");
      merged.push(text);
    }
  }

  if (future.length === 0) return merged;
  return merged.length === 0 ? future : [...future, "", ...merged];
}

function isSingleLineImport(line: string): boolean {
  if (!SINGLE_LINE_IMPORT.test(line)) return false;
  const code = line.replace(/#.*$/, "").trimEnd();
  // A parenthesised import still open at the end of the line, or a backslash
  // continuation, spans several lines. It is left in its block, unmerged.
  if (code.endsWith("\\")) return false;
  const opens = (code.match(/\(/g) ?? []).length;
  const closes = (code.match(/\)/g) ?? []).length;
  return opens === closes;
}
