import { describe, expect, test } from "vitest";
import {
  listingPath,
  publishedAddress,
  publishedState,
  readPublishedListing,
  type PublishedListing,
} from "./published-listing";

const listing: PublishedListing = {
  handle: "ddieruf",
  name: "post-slack-message",
  version: "1.0.0",
  accountCreated: true,
};

describe("readPublishedListing", () => {
  test("reads the listing the state carries", () => {
    expect(readPublishedListing(publishedState(listing))).toEqual(listing);
  });

  test.each([
    ["no state", null],
    ["another state", { origin: "/" }],
    [
      "a listing missing the created flag",
      { published: { ...listing, accountCreated: undefined } },
    ],
    ["a listing with an empty name", { published: { ...listing, name: "" } }],
  ])("is undefined for %s", (_, state) => {
    expect(readPublishedListing(state)).toBeUndefined();
  });
});

describe("the listing's address", () => {
  test("is handle/name@version", () => {
    expect(publishedAddress(listing)).toBe("ddieruf/post-slack-message@1.0.0");
  });

  test("its page is at /handle/name@version", () => {
    expect(listingPath(listing)).toBe("/ddieruf/post-slack-message@1.0.0");
  });
});
