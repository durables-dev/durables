/**
 * The pasted code as detection reads it. Line breaks are normalised to `\n`, so a pattern
 * written against `\n` works on Windows line endings too. A `\r\n` pair counts as one line
 * break and a lone `\r` counts as one, as the editor's gutter counts them. The published
 * code is never this text; it is always the code exactly as pasted.
 */
export interface Source {
  /** The code with every line break as `\n`. */
  readonly text: string;
  /** The code's lines, without their line breaks. Line 1 is `lines[0]`. */
  readonly lines: readonly string[];
}

/** Any line break: `\r\n`, a lone `\r` or `\n`. */
const lineBreak = /\r\n|\r|\n/g;

export const toSource = (code: string): Source => {
  const text = code.replace(lineBreak, "\n");
  return { text, lines: text.split("\n") };
};

/** The 1-based line number of a character offset in `source.text`, such as a match's index. */
export const lineAt = (source: Source, offset: number) => {
  let line = 1;
  for (let i = 0; i < offset && i < source.text.length; i++) {
    if (source.text[i] === "\n") {
      line++;
    }
  }
  return line;
};
