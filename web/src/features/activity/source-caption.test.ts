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

test("the count matches the line numbers, so a trailing line break counts one more", () => {
  expect(sourceCaption("activities.py", "a\nb\n")).toBe(
    "activities.py · 3 lines",
  );
});
