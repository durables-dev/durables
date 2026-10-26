import { describe, expect, test } from "vitest";
import type { StepId } from "./steps";
import { stillNeeded } from "./still-needed";

const allBeforeReview: StepId[] = ["profile", "code", "detected", "details"];

describe("stillNeeded", () => {
  test("is empty when every earlier step is finished", () => {
    expect(stillNeeded(allBeforeReview)).toEqual([]);
  });

  test.each([
    ["profile", "Profile & Handle"],
    ["code", "Code"],
    ["detected", "Detected"],
    ["details", "Details"],
  ] as const)("names %s when it is not finished", (step, label) => {
    const finished = allBeforeReview.filter((id) => id !== step);
    expect(stillNeeded(finished)).toEqual([label]);
  });

  test("names every unfinished step, in step order", () => {
    expect(stillNeeded(["details", "profile"])).toEqual(["Code", "Detected"]);
    expect(stillNeeded([])).toEqual([
      "Profile & Handle",
      "Code",
      "Detected",
      "Details",
    ]);
  });

  test("never names Review itself", () => {
    expect(stillNeeded(allBeforeReview)).not.toContain("Review");
  });
});
