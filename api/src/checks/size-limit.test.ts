import { describe, expect, it } from "vitest";
import {
  codeByteLength,
  isWithinSizeLimit,
  MAX_CODE_BYTES,
} from "./size-limit";

describe("size limit", () => {
  it("is 100 KB", () => {
    expect(MAX_CODE_BYTES).toBe(102_400);
  });

  it("accepts code of exactly the limit and refuses one byte more", () => {
    expect(isWithinSizeLimit("a".repeat(MAX_CODE_BYTES))).toBe(true);
    expect(isWithinSizeLimit("a".repeat(MAX_CODE_BYTES + 1))).toBe(false);
  });

  it("counts multi-byte characters in bytes of UTF-8", () => {
    expect(codeByteLength("é")).toBe(2);
    expect(codeByteLength("€")).toBe(3);
    expect(codeByteLength("😀")).toBe(4);
    expect(isWithinSizeLimit("é".repeat(MAX_CODE_BYTES / 2))).toBe(true);
    expect(isWithinSizeLimit(`${"é".repeat(MAX_CODE_BYTES / 2)}a`)).toBe(false);
  });
});
