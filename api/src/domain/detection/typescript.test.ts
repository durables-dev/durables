import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dotnetDetector } from "./dotnet.js";
import { pythonDetector } from "./python.js";
import { typescriptDetector } from "./typescript.js";

const captureCharge = readFileSync(new URL("../../../test-fixtures/typescript/capture-charge.ts", import.meta.url), "utf8");

describe("typescriptDetector", () => {
  it("detects the capture-charge seed", () => {
    expect(typescriptDetector.detect(captureCharge)).toEqual({
      sdk: { value: "typescript", line: 1 },
      activityName: { value: "captureCharge", line: 14 },
      inputTypes: [{ name: "input", type: "CaptureChargeInput", line: 14 }],
      outputType: { value: "CaptureChargeResult", line: 14 },
      nonRetryableErrorTypes: [{ value: "ChargeNotCapturable", line: 32 }],
      envVars: [
        { value: "MOCK_PAYMENTS_URL", line: 18 },
        { value: "MOCK_PAYMENTS_API_KEY", line: 24 },
      ],
    });
  });

  it("is the only detector that recognises it", () => {
    expect([pythonDetector, typescriptDetector, dotnetDetector].map((d) => d.recognises(captureCharge))).toEqual([false, true, false]);
    expect(typescriptDetector.recognises('// import { x } from "@temporalio/activity";\nexport async function a() {}')).toBe(false);
  });

  it("handles multi-line imports, generics, create(), bracket env reads and comments", () => {
    const code = [
      "import {", // 1
      "  ApplicationFailure,", // 2
      '} from "@temporalio/common";', // 3
      "// process.env.COMMENTED_OUT", // 4
      "/* export async function notThisOne() {} */", // 5
      "export async function sendEmail(", // 6
      "  to: string,", // 7
      "  options: Record<string, number> = {},", // 8
      "): Promise<void> {", // 9
      '  const host = process.env["SMTP_HOST"];', // 10
      "  const port = process.env['SMTP_PORT'];", // 11
      "  const again = process.env.SMTP_HOST;", // 12
      '  throw ApplicationFailure.create({ message: "no", nonRetryable: true, type: "BadAddress" });', // 13
      "}", // 14
    ].join("\n");
    const detection = typescriptDetector.detect(code);
    expect(detection.sdk.line).toBe(1);
    expect(detection.activityName).toEqual({ value: "sendEmail", line: 6 });
    expect(detection.inputTypes).toEqual([
      { name: "to", type: "string", line: 7 },
      { name: "options", type: "Record<string, number>", line: 8 },
    ]);
    expect(detection.outputType).toEqual({ value: "void", line: 9 });
    expect(detection.nonRetryableErrorTypes).toEqual([{ value: "BadAddress", line: 13 }]);
    expect(detection.envVars).toEqual([
      { value: "SMTP_HOST", line: 10 },
      { value: "SMTP_PORT", line: 11 },
    ]);
  });
});
