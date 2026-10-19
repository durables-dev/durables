import { describe, expect, test } from "vitest";
import {
  contributeEntryState,
  contributeOriginSchema,
  originFromEntryState,
} from "./contribute-origin";

describe("contributeEntryState", () => {
  test("names the page the link sits on, with its search", () => {
    expect(contributeEntryState({ pathname: "/terms", search: "" })).toEqual({
      from: "/terms",
    });
    expect(
      contributeEntryState({ pathname: "/search", search: "?q=stripe" }),
    ).toEqual({ from: "/search?q=stripe" });
  });
});

describe("originFromEntryState", () => {
  test("reads the page the flow was opened from", () => {
    expect(originFromEntryState({ from: "/" })).toBe("/");
    expect(originFromEntryState({ from: "/search?q=stripe" })).toBe(
      "/search?q=stripe",
    );
  });

  test("is undefined when the state names no page", () => {
    expect(originFromEntryState(null)).toBeUndefined();
    expect(originFromEntryState(undefined)).toBeUndefined();
    expect(originFromEntryState({})).toBeUndefined();
    expect(originFromEntryState({ from: 42 })).toBeUndefined();
  });

  test("refuses another origin", () => {
    expect(originFromEntryState({ from: "https://example.com/" })).toBe(
      undefined,
    );
    expect(originFromEntryState({ from: "//example.com/" })).toBeUndefined();
    expect(originFromEntryState({ from: "/\\example.com/" })).toBeUndefined();
    expect(originFromEntryState({ from: "terms" })).toBeUndefined();
  });

  test("refuses a page inside the Contribute flow", () => {
    expect(originFromEntryState({ from: "/contribute" })).toBeUndefined();
    expect(
      originFromEntryState({ from: "/contribute/profile?sign-in=failed" }),
    ).toBeUndefined();
  });

  test("keeps a page that only starts with the same letters", () => {
    expect(contributeOriginSchema.safeParse("/contributors").success).toBe(
      true,
    );
  });
});
