import { describe, expect, test } from "vitest";
import { listingPath } from "./listing-path";

describe("listingPath", () => {
  test("a version's Activity page is /handle/name@version", () => {
    expect(
      listingPath({ handle: "ddieruf", name: "charge-card", version: "1.2.0" }),
    ).toBe("/ddieruf/charge-card@1.2.0");
  });

  test("its page is at /handle/name@version", () => {
    expect(
      listingPath({
        handle: "ddieruf",
        name: "post-slack-message",
        version: "1.0.0",
      }),
    ).toBe("/ddieruf/post-slack-message@1.0.0");
  });

  test("each part is percent-encoded", () => {
    expect(
      listingPath({ handle: "a/b", name: "c?d", version: "1.0.0#x" }),
    ).toBe("/a%2Fb/c%3Fd@1.0.0%23x");
  });
});
