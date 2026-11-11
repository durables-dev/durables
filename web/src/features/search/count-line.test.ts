import { expect, test } from "vitest";
import { countLine } from "./count-line";

test("with no words the line says sorted by newest", () => {
  expect(countLine(10, "newest")).toBe("10 activities · sorted by newest");
});

test("with words the line says sorted by relevance", () => {
  expect(countLine(3, "relevance")).toBe("3 activities · sorted by relevance");
});

test("one match reads as one activity", () => {
  expect(countLine(1, "newest")).toBe("1 activity · sorted by newest");
});

test("no matches reads as 0 activities", () => {
  expect(countLine(0, "relevance")).toBe("0 activities · sorted by relevance");
});

test("a large count is grouped in thousands", () => {
  expect(countLine(1250, "newest")).toBe("1,250 activities · sorted by newest");
});
