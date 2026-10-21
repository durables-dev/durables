import { describe, expect, test } from "vitest";
import { lineCount } from "./line-count";

describe("lineCount", () => {
  test("empty text is one line", () => {
    expect(lineCount("")).toBe(1);
  });

  test("counts each line of the text", () => {
    expect(lineCount("import x\n\nx.run()")).toBe(3);
  });

  test("a trailing line break starts another line", () => {
    expect(lineCount("import x\n")).toBe(2);
  });

  test("CRLF text has the same count as LF text", () => {
    const lf = "a\nb\n\nc\n";
    expect(lineCount(lf.replaceAll("\n", "\r\n"))).toBe(lineCount(lf));
  });

  test("a lone CR ends a line", () => {
    expect(lineCount("a\rb")).toBe(2);
  });
});
