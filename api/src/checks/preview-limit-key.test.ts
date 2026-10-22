import { describe, expect, it } from "vitest";
import { previewLimitKey } from "./preview-limit-key";

describe("previewLimitKey", () => {
  it("keys the limit by the publisher's provider identity", () => {
    expect(
      previewLimitKey({ provider: "github", providerAccountId: "12345" }),
    ).toBe("github:12345");
  });

  it("gives two publishers different keys", () => {
    expect(
      previewLimitKey({ provider: "github", providerAccountId: "1" }),
    ).not.toBe(previewLimitKey({ provider: "github", providerAccountId: "2" }));
  });

  it("gives the same account ID under two providers different keys", () => {
    expect(
      previewLimitKey({ provider: "github", providerAccountId: "1" }),
    ).not.toBe(previewLimitKey({ provider: "gitlab", providerAccountId: "1" }));
  });
});
