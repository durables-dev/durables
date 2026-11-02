import { expect, test } from "vitest";
import { codeLines } from "./code-lines";

test("each line break starts a new line", () => {
  expect(codeLines("a\nb\nc")).toEqual(["a", "b", "c"]);
});

test("a file of one line is one line", () => {
  expect(codeLines("print('hi')")).toEqual(["print('hi')"]);
});

test("empty code is one empty line", () => {
  expect(codeLines("")).toEqual([""]);
});

test("a trailing line break starts one more, empty, line", () => {
  expect(codeLines("a\n")).toEqual(["a", ""]);
});

test("tabs, odd indentation and trailing spaces stay in their line", () => {
  expect(codeLines("\tx = 1  \n   y = 2\r\n")).toEqual([
    "\tx = 1  ",
    "   y = 2\r",
    "",
  ]);
});
