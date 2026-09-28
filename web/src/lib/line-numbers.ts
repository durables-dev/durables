/** Parses "37, 38 40-42" into [37, 38, 40, 41, 42]. Ignores anything that is not a positive number or range. */
export function parseLineNumbers(text: string): number[] {
  const lines: number[] = [];
  for (const token of text.split(/[\s,]+/)) {
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      for (let line = from; line <= to && line - from < 500; line++) lines.push(line);
    } else if (/^\d+$/.test(token) && Number(token) > 0) {
      lines.push(Number(token));
    }
  }
  return [...new Set(lines)];
}
