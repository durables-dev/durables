import { reservedHandles } from "@durables/schemas";
import { describe, expect, test } from "vitest";
import {
  earliestUnfinished,
  finishedSteps,
  flowSteps,
  isLocked,
  resolveStep,
  steps,
} from "./steps";

test("lists Profile & Handle, then Code, Detected, Details and Review, with no README", () => {
  expect(steps.map((step) => step.label)).toEqual([
    "Profile & Handle",
    "Code",
    "Detected",
    "Details",
    "Review",
  ]);
  expect(steps.map((step) => step.label.toLowerCase())).not.toContain("readme");
});

test("contribute stays on the reserved-handle list", () => {
  expect(reservedHandles.has("contribute")).toBe(true);
});

describe("earliestUnfinished", () => {
  test("is Profile & Handle when nothing is finished", () => {
    expect(earliestUnfinished([])).toBe("profile");
  });

  test("is the first step not finished", () => {
    expect(earliestUnfinished(["profile", "code"])).toBe("detected");
  });

  test("ignores a later step finished out of order", () => {
    expect(earliestUnfinished(["code"])).toBe("profile");
  });

  test("is Review when every step is finished", () => {
    expect(
      earliestUnfinished(["profile", "code", "detected", "details", "review"]),
    ).toBe("review");
  });
});

describe("isLocked", () => {
  test("never locks Profile & Handle", () => {
    expect(isLocked("profile", [])).toBe(false);
  });

  test("locks every later step until the earlier steps are finished", () => {
    expect(isLocked("code", [])).toBe(true);
    expect(isLocked("review", [])).toBe(true);
    expect(isLocked("review", ["profile", "code", "detected"])).toBe(true);
  });

  test("unlocks a step once every earlier step is finished", () => {
    expect(isLocked("code", ["profile"])).toBe(false);
    expect(isLocked("details", ["profile", "code", "detected"])).toBe(false);
  });

  test("keeps a step locked when an earlier step is unfinished, whatever came after", () => {
    expect(isLocked("details", ["code", "detected"])).toBe(true);
  });
});

describe("resolveStep", () => {
  test("keeps an open step", () => {
    expect(resolveStep("profile", [])).toBe("profile");
    expect(resolveStep("code", ["profile"])).toBe("code");
  });

  test("keeps a finished step, so the publisher can go back to it", () => {
    expect(resolveStep("profile", ["profile", "code"])).toBe("profile");
  });

  test("sends a locked step to the earliest unfinished step", () => {
    expect(resolveStep("review", [])).toBe("profile");
    expect(resolveStep("details", ["profile"])).toBe("code");
  });

  test("sends an unknown step to the earliest unfinished step", () => {
    expect(resolveStep("readme", [])).toBe("profile");
    expect(resolveStep("no-such-step", ["profile"])).toBe("code");
    expect(resolveStep("Code", ["profile"])).toBe("code");
  });

  test("sends a missing step to the earliest unfinished step", () => {
    expect(resolveStep(undefined, [])).toBe("profile");
    expect(resolveStep(undefined, ["profile", "code"])).toBe("detected");
  });
});

describe("finishedSteps", () => {
  test("is the draft's finished steps for a publisher with no account", () => {
    expect(finishedSteps([], false)).toEqual([]);
    expect(finishedSteps(["profile"], false)).toEqual(["profile"]);
  });

  test("counts Profile & Handle as finished for a publisher with an account", () => {
    expect(finishedSteps([], true)).toEqual(["profile"]);
    expect(resolveStep("code", finishedSteps([], true))).toBe("code");
  });

  test("keeps the draft's steps for a publisher with an account", () => {
    expect(finishedSteps(["profile", "code"], true)).toEqual([
      "profile",
      "code",
    ]);
  });
});

describe("the new-version flow", () => {
  test("is Code, Detected, Details and Review, with no Profile & Handle", () => {
    expect(flowSteps("newVersion").map(({ id }) => id)).toEqual([
      "code",
      "detected",
      "details",
      "review",
    ]);
    expect(flowSteps("first")).toBe(steps);
  });

  test("starts at Code", () => {
    expect(earliestUnfinished([], "newVersion")).toBe("code");
    expect(resolveStep(undefined, [], "newVersion")).toBe("code");
  });

  test("never opens Profile & Handle", () => {
    expect(isLocked("profile", [], "newVersion")).toBe(true);
    expect(resolveStep("profile", ["code"], "newVersion")).toBe("detected");
  });

  test("locks a step until the steps before it are finished", () => {
    expect(isLocked("detected", [], "newVersion")).toBe(true);
    expect(isLocked("detected", ["code"], "newVersion")).toBe(false);
    expect(resolveStep("review", ["code", "detected"], "newVersion")).toBe(
      "details",
    );
  });
});
