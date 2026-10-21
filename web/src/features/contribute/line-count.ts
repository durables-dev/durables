// A textarea stores line breaks as "\n", but pasted text can arrive with "\r\n" or "\r".
// Counting every form the same way keeps the gutter in step with the stored text.
const LINE_BREAK = /\r\n|\r|\n/;

/** The number of lines in `text`. Empty text is one line; a trailing break starts another. */
export function lineCount(text: string): number {
  return text.split(LINE_BREAK).length;
}

/** "1\n2\n…" up to the line count of `text`, for a line-number gutter. */
export function lineNumbers(text: string): string {
  return Array.from({ length: lineCount(text) }, (_, index) => index + 1).join(
    "\n",
  );
}
