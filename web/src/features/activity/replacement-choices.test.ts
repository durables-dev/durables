import { describe, expect, test } from "vitest";
import {
  defaultReplacement,
  noReplacement,
  replacementChoices,
} from "./replacement-choices";

describe("replacementChoices", () => {
  test("offers No replacement, then every other version, the latest marked", () => {
    expect(replacementChoices(["2.0.0", "1.1.0", "1.0.0"], "1.0.0")).toEqual([
      { value: noReplacement, label: "No replacement" },
      { value: "2.0.0", label: "2.0.0 (latest)" },
      { value: "1.1.0", label: "1.1.0" },
    ]);
  });

  test("leaves out the version being deprecated, even when it is the latest", () => {
    expect(replacementChoices(["2.0.0", "1.1.0", "1.0.0"], "2.0.0")).toEqual([
      { value: noReplacement, label: "No replacement" },
      { value: "1.1.0", label: "1.1.0" },
      { value: "1.0.0", label: "1.0.0" },
    ]);
  });

  test("offers only No replacement when there is one version", () => {
    expect(replacementChoices(["1.0.0"], "1.0.0")).toEqual([
      { value: noReplacement, label: "No replacement" },
    ]);
  });
});

describe("defaultReplacement", () => {
  test("starts on the latest version when an older one is deprecated", () => {
    expect(defaultReplacement(["2.0.0", "1.1.0", "1.0.0"], "1.1.0")).toBe(
      "2.0.0",
    );
  });

  test("starts on the newest other version when the latest is deprecated", () => {
    expect(defaultReplacement(["2.0.0", "1.1.0", "1.0.0"], "2.0.0")).toBe(
      "1.1.0",
    );
  });

  test("starts on No replacement when there is one version", () => {
    expect(defaultReplacement(["1.0.0"], "1.0.0")).toBe(noReplacement);
  });
});
