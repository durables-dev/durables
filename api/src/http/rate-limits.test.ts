import { describe, expect, it } from "vitest";
import { publisherLimitKey } from "./rate-limits";

describe("publisherLimitKey", () => {
  it("keys the limit by the publisher's provider identity", () => {
    expect(
      publisherLimitKey({ provider: "github", providerAccountId: "12345" }),
    ).toBe("github:12345");
  });

  it("gives two publishers different keys", () => {
    expect(
      publisherLimitKey({ provider: "github", providerAccountId: "1" }),
    ).not.toBe(
      publisherLimitKey({ provider: "github", providerAccountId: "2" }),
    );
  });

  it("is the same for every session of a publisher, so publishing and the preview share it", () => {
    expect(
      publisherLimitKey({ provider: "gitlab", providerAccountId: "42" }),
    ).toBe(publisherLimitKey({ provider: "gitlab", providerAccountId: "42" }));
  });

  it("gives the same account ID under two providers different keys", () => {
    expect(
      publisherLimitKey({ provider: "github", providerAccountId: "1" }),
    ).not.toBe(
      publisherLimitKey({ provider: "gitlab", providerAccountId: "1" }),
    );
  });
});
