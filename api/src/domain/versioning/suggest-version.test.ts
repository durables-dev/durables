import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Detection } from "../../model/detection.js";
import { pythonDetector } from "../detection/python.js";
import { typescriptDetector } from "../detection/typescript.js";
import { bumpVersion, isVersion } from "./semver.js";
import { suggestVersion } from "./suggest-version.js";

const fixture = (name: string) => readFileSync(new URL(`../../../test-fixtures/${name}`, import.meta.url), "utf8");
const v1 = pythonDetector.detect(fixture("python/charge_card.py"));
const v2 = pythonDetector.detect(fixture("python/charge_card_v2.py"));

describe("suggestVersion", () => {
  it("suggests 1.0.0 for a first publish", () => {
    expect(suggestVersion(null, v1, null)).toEqual({ previousVersion: null, suggestedVersion: "1.0.0", bump: "first", reasons: [] });
  });

  it("suggests a major bump for the charge-card v2 sample, naming the removed and added fields", () => {
    expect(suggestVersion(v1, v2, "1.0.0")).toEqual({
      previousVersion: "1.0.0",
      suggestedVersion: "2.0.0",
      bump: "major",
      reasons: [
        {
          bump: "major",
          kind: "input-fields",
          message:
            "The input type changed: ChargeCardInput no longer has amount_cents (int) or currency (str), and has a new field amount (Money).",
          line: 19,
        },
      ],
    });
  });

  it("suggests a patch when nothing in the signature, errors or environment changed", () => {
    const suggestion = suggestVersion(v1, v1, "1.4.2");
    expect(suggestion.suggestedVersion).toBe("1.4.3");
    expect(suggestion.reasons.map((reason) => reason.kind)).toEqual(["unchanged"]);
  });

  it("suggests a minor bump when only the errors or environment variables differ", () => {
    const changed: Detection = {
      ...v1,
      nonRetryableErrorTypes: [{ value: "CardExpired", line: 50 }],
      envVars: [...v1.envVars, { value: "MOCK_PAYMENTS_REGION", line: 40 }],
    };
    const suggestion = suggestVersion(v1, changed, "1.0.0");
    expect(suggestion.bump).toBe("minor");
    expect(suggestion.suggestedVersion).toBe("1.1.0");
    expect(suggestion.reasons.map((reason) => reason.message)).toEqual([
      "The non-retryable error types changed: added CardExpired; removed CardDeclined.",
      "The environment variables changed: added MOCK_PAYMENTS_REGION.",
    ]);
  });

  it("lets major win and lists every reason", () => {
    const changed: Detection = {
      ...v2,
      activityName: { value: "charge_card_v2", line: 56 },
      outputType: { value: "dict", line: 57 },
      envVars: [v2.envVars[0]],
    };
    const suggestion = suggestVersion(v1, changed, "1.2.3");
    expect(suggestion.bump).toBe("major");
    expect(suggestion.suggestedVersion).toBe("2.0.0");
    expect(suggestion.reasons.map((reason) => [reason.bump, reason.kind])).toEqual([
      ["major", "activity-name"],
      ["major", "input-fields"],
      ["major", "output-type"],
      ["minor", "env-vars"],
    ]);
  });

  it("compares parameter type names when fields aren't known (TypeScript)", () => {
    const code = fixture("typescript/capture-charge.ts");
    const before = typescriptDetector.detect(code);
    const renamed = { ...before, inputTypes: before.inputTypes.map((input) => ({ ...input, type: `${input.type}V2` })) };
    const suggestion = suggestVersion(before, renamed, "1.0.0");
    expect(suggestion.reasons.map((reason) => reason.kind)).toEqual(["parameters"]);
    expect(suggestVersion(before, before, "1.0.0").bump).toBe("patch");
  });
});

describe("semver helpers", () => {
  it("accepts only plain x.y.z", () => {
    expect(["1.0.0", "2.10.0", "0.0.1"].every(isVersion)).toBe(true);
    expect(["1.0", "v2.0.0", "2.0.0-beta", "01.0.0", ""].some(isVersion)).toBe(false);
  });

  it("bumps", () => {
    expect([bumpVersion("1.4.2", "major"), bumpVersion("1.4.2", "minor"), bumpVersion("1.4.2", "patch")]).toEqual([
      "2.0.0",
      "1.5.0",
      "1.4.3",
    ]);
  });
});
