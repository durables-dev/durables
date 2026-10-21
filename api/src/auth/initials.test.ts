import { describe, expect, test } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  test.each([
    ["David Dieruf", "DD"],
    ["david dieruf", "DD"],
    ["Ada", "A"],
    ["Mary Ann Smith", "MS"],
    ["  Grace   Hopper  ", "GH"],
    ["Jean-Luc Picard", "JP"],
    ["Émile Zola", "ÉZ"],
    ["(Dave) Dieruf", "DD"],
    ["R2 D2", "RD"],
  ])("derives the initials of %j as %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  test("skips words with no letter or digit", () => {
    expect(initials("Ada — Lovelace")).toBe("AL");
  });

  test("answers ? for a name with no letter or digit", () => {
    expect(initials("!!!")).toBe("?");
  });
});
