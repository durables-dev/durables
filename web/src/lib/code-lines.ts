/**
 * The lines the shared code block shows for this code, one per line number. The code is
 * split at each "\n" and nothing else is changed, so tabs, trailing spaces and any "\r" stay
 * in their line. A trailing line break starts one more, empty, line.
 */
export function codeLines(code: string): string[] {
  return code.split("\n");
}
