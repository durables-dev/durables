import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dotnetDetector, unwrapTask } from "./dotnet.js";
import { pythonDetector } from "./python.js";
import { typescriptDetector } from "./typescript.js";

const voidCharge = readFileSync(new URL("../../../test-fixtures/dotnet/VoidCharge.cs", import.meta.url), "utf8");

describe("dotnetDetector", () => {
  it("detects the void-charge seed", () => {
    expect(dotnetDetector.detect(voidCharge)).toEqual({
      sdk: { value: "dotnet", line: 7 },
      activityName: { value: "VoidCharge", line: 19 },
      inputTypes: [{ name: "input", type: "VoidChargeInput", line: 19 }],
      outputType: { value: "VoidChargeResult", line: 19 },
      nonRetryableErrorTypes: [{ value: "ChargeAlreadyCaptured", line: 35 }],
      envVars: [
        { value: "MOCK_PAYMENTS_URL", line: 24 },
        { value: "MOCK_PAYMENTS_API_KEY", line: 25 },
      ],
    });
  });

  it("is the only detector that recognises it", () => {
    expect([pythonDetector, typescriptDetector, dotnetDetector].map((d) => d.recognises(voidCharge))).toEqual([false, false, true]);
  });

  it("takes an explicit activity name, several parameters and a bare Task", () => {
    const code = [
      "using Temporalio.Activities;", // 1
      "public static class Mail", // 2
      "{", // 3
      '    // Environment.GetEnvironmentVariable("COMMENTED_OUT")', // 4
      '    [Activity("send-email")]', // 5
      "    public static async Task SendEmailAsync(", // 6
      "        string to,", // 7
      "        Dictionary<string, int> options,", // 8
      "        CancellationToken token = default)", // 9
      "    {", // 10
      '        var host = Environment.GetEnvironmentVariable("SMTP_HOST");', // 11
      "    }", // 12
      "}", // 13
    ].join("\n");
    const detection = dotnetDetector.detect(code);
    expect(detection.activityName).toEqual({ value: "send-email", line: 5 });
    expect(detection.inputTypes).toEqual([
      { name: "to", type: "string", line: 7 },
      { name: "options", type: "Dictionary<string, int>", line: 8 },
      { name: "token", type: "CancellationToken", line: 9 },
    ]);
    expect(detection.outputType).toEqual({ value: "void", line: 6 });
    expect(detection.nonRetryableErrorTypes).toEqual([]);
    expect(detection.envVars).toEqual([{ value: "SMTP_HOST", line: 11 }]);
  });

  it("unwraps Task<T> and ValueTask<T>", () => {
    expect(unwrapTask("Task<List<string>>")).toBe("List<string>");
    expect(unwrapTask("ValueTask<int>")).toBe("int");
    expect(unwrapTask("Task")).toBe("void");
    expect(unwrapTask("string")).toBe("string");
  });
});
