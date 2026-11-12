import { expect, test } from "vitest";
import { listingSearchDescription } from "./listing-search-description";

test("follows the publisher's line with the SDK and the publisher", () => {
  expect(
    listingSearchDescription({
      description: "Charges a card through Stripe.",
      sdk: "Python",
      handle: "acme",
    }),
  ).toBe(
    "Charges a card through Stripe. A Python Temporal activity by acme on Durables.",
  );
});

test("adds a full stop when the line ends without one", () => {
  expect(
    listingSearchDescription({
      description: "Posts a message to Slack ",
      sdk: ".NET",
      handle: "acme",
    }),
  ).toBe(
    "Posts a message to Slack. A .NET Temporal activity by acme on Durables.",
  );
});

test("keeps a line that already ends with a question or exclamation mark", () => {
  expect(
    listingSearchDescription({
      description: "Sends a text!",
      sdk: "TypeScript",
      handle: "acme",
    }),
  ).toBe("Sends a text! A TypeScript Temporal activity by acme on Durables.");
});
