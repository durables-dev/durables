import type { ListingDetails } from "@durables/schemas";
import { describe, expect, test } from "vitest";
import type { StepId } from "./steps";
import { stillNeeded } from "./still-needed";

const allBeforeReview: StepId[] = ["profile", "code", "detected", "details"];

const validDetails: ListingDetails = {
  title: "Post slack message",
  name: "post-slack-message",
  description: "Posts a message to a Slack channel.",
};

describe("stillNeeded", () => {
  test("is empty when every earlier step is finished and the details are valid", () => {
    expect(stillNeeded(allBeforeReview, validDetails)).toEqual([]);
  });

  test.each([
    ["profile", "Profile & Handle"],
    ["code", "Code"],
    ["detected", "Detected"],
    ["details", "Details"],
  ] as const)("names %s when it is not finished", (step, label) => {
    const finished = allBeforeReview.filter((id) => id !== step);
    expect(stillNeeded(finished, validDetails)).toEqual([label]);
  });

  test("names every unfinished step, in step order", () => {
    expect(stillNeeded(["details", "profile"], validDetails)).toEqual([
      "Code",
      "Detected",
    ]);
    expect(stillNeeded([], validDetails)).toEqual([
      "Profile & Handle",
      "Code",
      "Detected",
      "Details",
    ]);
  });

  test("never names Review itself", () => {
    expect(stillNeeded(allBeforeReview, validDetails)).not.toContain("Review");
  });

  test.each([
    ["an empty title", { ...validDetails, title: "" }],
    ["a name that breaks the rule", { ...validDetails, name: "Post--Slack" }],
    ["an empty description", { ...validDetails, description: "  " }],
    [
      "a description over 160 characters",
      { ...validDetails, description: "x".repeat(161) },
    ],
  ])("names Details when it is finished but has %s", (_, details) => {
    expect(stillNeeded(allBeforeReview, details)).toEqual(["Details"]);
  });

  test("names Details once when it is unfinished and invalid", () => {
    expect(
      stillNeeded(["profile", "code", "detected"], {
        ...validDetails,
        title: "",
      }),
    ).toEqual(["Details"]);
  });
});
