import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { typescriptDetector } from "../detection/typescript.js";
import { generateSnippets } from "./snippets.js";

const captureCharge = readFileSync(new URL("../../../test-fixtures/typescript/capture-charge.ts", import.meta.url), "utf8");
const exampleInput = { chargeId: "ch_123", amountCents: 1999 };

const snippets = generateSnippets("typescript", {
  name: "capture-charge",
  code: captureCharge,
  detection: typescriptDetector.detect(captureCharge),
  exampleInput,
});
const tab = (name: string) => snippets.find((s) => s.tab === name)!.content;

describe("TypeScript snippets", () => {
  it("returns the five tabs in order", () => {
    expect(snippets.map((s) => [s.tab, s.filename, s.language])).toEqual([
      ["install", undefined, "shell"],
      ["activity", "capture-charge.ts", "typescript"],
      ["workflow", "workflow.ts", "typescript"],
      ["worker", "worker.ts", "typescript"],
      ["starter", "starter.ts", "typescript"],
    ]);
    expect(tab("install")).toBe(
      "npm install @temporalio/activity @temporalio/client @temporalio/common @temporalio/worker @temporalio/workflow",
    );
    expect(tab("activity")).toBe(captureCharge);
  });

  it("proxies the activity with the recommended policy and the detected error type", () => {
    const workflow = tab("workflow");
    expect(workflow).toContain('import type * as activities from "./capture-charge";');
    expect(workflow).toContain('import type { CaptureChargeInput, CaptureChargeResult } from "./capture-charge";');
    expect(workflow).toContain("const { captureCharge } = proxyActivities<typeof activities>({");
    expect(workflow).toContain('startToCloseTimeout: "30 seconds",');
    expect(workflow).toContain('nonRetryableErrorTypes: ["ChargeNotCapturable"],');
    expect(workflow).toContain(
      "export async function captureChargeWorkflow(input: CaptureChargeInput): Promise<CaptureChargeResult> {\n  return await captureCharge(input);",
    );
    expect(workflow).not.toContain("{{");
  });

  it("runs the worker on the listing's task queue, and starts the workflow with the example input", () => {
    expect(tab("worker")).toContain('const TASK_QUEUE = "capture-charge";');
    expect(tab("worker")).toContain('workflowsPath: require.resolve("./workflow"),');
    const starter = tab("starter");
    expect(starter).toContain('workflowId: "capture-charge-" + randomUUID(),');
    expect(starter).toContain('    args: [\n      {\n        chargeId: "ch_123",\n        amountCents: 1999,\n      },\n    ],\n  });');
  });
});
