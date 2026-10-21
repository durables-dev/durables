import { expect, test } from "vitest";
import { lineCount, lineNumbers } from "./line-count";

test("empty text is one line", () => {
  expect(lineCount("")).toBe(1);
  expect(lineNumbers("")).toBe("1");
});

test("counts every line, blank lines included", () => {
  expect(lineCount("a\n\nb")).toBe(3);
  expect(lineNumbers("a\n\nb")).toBe("1\n2\n3");
});

test("a trailing newline starts another line", () => {
  expect(lineCount("a\nb\n")).toBe(3);
});

test("CRLF and CR text count the same as LF text", () => {
  const lf = "import os\n\n\tdef run():\n\t\treturn 1\n";
  expect(lineCount(lf.replaceAll("\n", "\r\n"))).toBe(lineCount(lf));
  expect(lineCount(lf.replaceAll("\n", "\r"))).toBe(lineCount(lf));
});

test("tabs and spaces do not change the count", () => {
  expect(lineCount("\t\t  \t")).toBe(1);
});
