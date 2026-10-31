import { expect, test } from "vitest";
import { sourceCaption } from "./source-caption";

test.each([
  ["activities.py", "Python"],
  ["activities.ts", "TypeScript"],
  ["Activities.cs", ".NET"],
])("names the %s file (%s) and counts its lines", (fileName) => {
  expect(sourceCaption(fileName, "a\nb\nc")).toBe(`${fileName} · 3 lines`);
});

test('a one-line file says "1 line"', () => {
  expect(sourceCaption("activities.py", "print('hi')")).toBe(
    "activities.py · 1 line",
  );
});

test("a line break at the end of the file does not add a line", () => {
  expect(sourceCaption("activities.py", "a\nb\n")).toBe(
    "activities.py · 2 lines",
  );
});

test('a one-line file ending in a line break says "1 line"', () => {
  expect(sourceCaption("activities.py", "print('hi')\n")).toBe(
    "activities.py · 1 line",
  );
});

test("a CRLF at the end of the file does not add a line", () => {
  expect(sourceCaption("activities.py", "a\r\nb\r\n")).toBe(
    "activities.py · 2 lines",
  );
});
