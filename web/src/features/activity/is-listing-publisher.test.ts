import type { SessionUser } from "@/lib/session";
import { describe, expect, test } from "vitest";
import { isListingPublisher } from "./is-listing-publisher";

const owner: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

describe("isListingPublisher", () => {
  test("is true for a signed-in account whose handle is the listing's", () => {
    expect(isListingPublisher(owner, "ddieruf")).toBe(true);
  });

  test("is false when signed out or while the session is still read", () => {
    expect(isListingPublisher(null, "ddieruf")).toBe(false);
  });

  test("is false before the account exists, even with the same chosen handle", () => {
    expect(
      isListingPublisher({ ...owner, accountExists: false }, "ddieruf"),
    ).toBe(false);
  });

  test("is false for an account with a different handle", () => {
    expect(isListingPublisher({ ...owner, handle: "someone" }, "ddieruf")).toBe(
      false,
    );
  });

  test("is false for an account with no handle", () => {
    expect(isListingPublisher({ ...owner, handle: null }, "ddieruf")).toBe(
      false,
    );
  });
});
