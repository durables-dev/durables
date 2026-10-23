import { describe, expect, it } from "vitest";
import { lineAt, toSource } from "./source";

describe("toSource", () => {
  it("splits LF, CRLF and lone CR into the same lines", () => {
    const expected = ["a", "b", "", "c"];
    expect(toSource("a\nb\n\nc").lines).toEqual(expected);
    expect(toSource("a\r\nb\r\n\r\nc").lines).toEqual(expected);
    expect(toSource("a\rb\r\rc").lines).toEqual(expected);
  });

  it("keeps everything but the line breaks exactly", () => {
    expect(toSource("\tx = 1  \r\n    y").text).toBe("\tx = 1  \n    y");
  });

  it("counts a trailing line break as starting an empty last line", () => {
    expect(toSource("a\r\n").lines).toEqual(["a", ""]);
  });
});

describe("lineAt", () => {
  it("numbers lines from 1", () => {
    const source = toSource("first\nsecond\nthird");
    expect(lineAt(source, 0)).toBe(1);
    expect(lineAt(source, source.text.indexOf("second"))).toBe(2);
    expect(lineAt(source, source.text.indexOf("third"))).toBe(3);
  });

  it("gives the same line for CRLF input as for LF input", () => {
    const lf = toSource("one\ntwo\nthree\nmarker");
    const crlf = toSource("one\r\ntwo\r\nthree\r\nmarker");
    expect(lineAt(crlf, crlf.text.indexOf("marker"))).toBe(4);
    expect(lineAt(crlf, crlf.text.indexOf("marker"))).toBe(
      lineAt(lf, lf.text.indexOf("marker")),
    );
  });
});
