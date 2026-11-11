import { describe, expect, test } from "vitest";
import { containsPattern, LIKE_ESCAPE } from "./like-pattern";

describe("a contains pattern", () => {
  test("matches the word anywhere in the text", () => {
    expect(containsPattern("stripe")).toBe("%stripe%");
  });

  test("escapes % and _ so they match themselves", () => {
    expect(containsPattern("100%_off")).toBe("%100\\%\\_off%");
  });

  test("escapes the escape character itself", () => {
    expect(containsPattern("a\\b")).toBe("%a\\\\b%");
  });

  test("keeps every other character as typed", () => {
    expect(containsPattern("Café-[x]*?")).toBe("%Café-[x]*?%");
  });

  test("escapes with a backslash", () => {
    expect(LIKE_ESCAPE).toBe("\\");
  });
});
