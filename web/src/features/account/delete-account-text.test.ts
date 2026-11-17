import { describe, expect, test } from "vitest";
import {
  confirmsHandle,
  listedActivitiesLeaveSearch,
} from "./delete-account-text";

describe("listedActivitiesLeaveSearch", () => {
  test.each([
    [0, "Your 0 listed activities leave search."],
    [1, "Your 1 listed activity leaves search."],
    [5, "Your 5 listed activities leave search."],
  ])("%i listed reads %s", (count, line) => {
    expect(listedActivitiesLeaveSearch(count)).toBe(line);
  });
});

describe("confirmsHandle", () => {
  test("the exact handle confirms", () => {
    expect(confirmsHandle("ddieruf", "ddieruf")).toBe(true);
  });

  test.each([
    ["empty", ""],
    ["a different case", "DDieruf"],
    ["a trailing space", "ddieruf "],
    ["a leading space", " ddieruf"],
    ["part of it", "ddieru"],
  ])("%s does not confirm", (_, typed) => {
    expect(confirmsHandle(typed, "ddieruf")).toBe(false);
  });
});
