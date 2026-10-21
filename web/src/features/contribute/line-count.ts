/**
 * How many lines the editor shows for this text. Empty text is one line, and a trailing line
 * break starts another. CRLF and a lone CR each end one line, as LF does.
 */
export function lineCount(text: string): number {
  return text.split(/\r\n|\r|\n/).length;
}
