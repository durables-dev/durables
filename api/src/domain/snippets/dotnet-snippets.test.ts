import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dotnetDetector } from "../detection/dotnet.js";
import { generateSnippets } from "./snippets.js";

const voidCharge = readFileSync(new URL("../../../test-fixtures/dotnet/VoidCharge.cs", import.meta.url), "utf8");
const exampleInput = { ChargeId: "ch_123", Reason: "requested_by_customer" };

const generate = (code: string) =>
  generateSnippets("dotnet", { name: "void-charge", code, detection: dotnetDetector.detect(code), exampleInput });
const snippets = generate(voidCharge);
const tab = (name: string) => snippets.find((s) => s.tab === name)!.content;

describe(".NET snippets", () => {
  it("returns the five tabs in order", () => {
    expect(snippets.map((s) => [s.tab, s.filename, s.language])).toEqual([
      ["install", undefined, "shell"],
      ["activity", "VoidCharge.cs", "csharp"],
      ["workflow", "VoidChargeWorkflow.cs", "csharp"],
      ["worker", "Worker.cs", "csharp"],
      ["starter", "Starter.cs", "csharp"],
    ]);
    expect(tab("install")).toBe("dotnet add package Temporalio");
    expect(tab("activity")).toBe(voidCharge);
  });

  it("calls the instance activity with the recommended policy and the detected error type", () => {
    const workflow = tab("workflow");
    expect(workflow).toContain("public async Task<VoidChargeResult> RunAsync(VoidChargeInput input)");
    expect(workflow).toContain("return await Workflow.ExecuteActivityAsync(\n            (ChargeActivities a) => a.VoidChargeAsync(input),");
    expect(workflow).toContain("StartToCloseTimeout = TimeSpan.FromSeconds(30),");
    expect(workflow).toContain('NonRetryableErrorTypes = new[] { "ChargeAlreadyCaptured" },');
    expect(workflow).not.toContain("{{");
  });

  it("gives the worker and the starter their own Main, each saying how to run it", () => {
    const worker = tab("worker");
    expect(worker.split("\n")[0]).toBe("// Run with: dotnet run -p:StartupObject=WorkerProgram");
    expect(worker).toContain("public static class WorkerProgram");
    expect(worker).toContain('private const string TaskQueue = "void-charge";');
    expect(worker).toContain("var activities = new ChargeActivities();");
    expect(worker).toContain(".AddActivity(activities.VoidChargeAsync)\n                .AddWorkflow<VoidChargeWorkflow>());");

    const starter = tab("starter");
    expect(starter.split("\n")[0]).toBe("// Run with: dotnet run -p:StartupObject=StarterProgram");
    expect(starter).toContain("public static class StarterProgram");
    expect(starter).toContain(
      '(VoidChargeWorkflow wf) => wf.RunAsync(new VoidChargeInput(ChargeId: "ch_123", Reason: "requested_by_customer")),',
    );
    expect(starter).toContain('new(id: $"void-charge-{Guid.NewGuid()}", taskQueue: TaskQueue));');
  });

  it("uses a static lambda, and no result, for a static activity returning a bare Task", () => {
    const code = voidCharge
      .replace("public async Task<VoidChargeResult> VoidChargeAsync", "public static async Task VoidChargeAsync")
      .replace("        return new VoidChargeResult(charge!.Id, charge.Status);\n", "");
    const [, , workflow, worker, starter] = generate(code);
    expect(workflow.content).toContain("public async Task RunAsync(VoidChargeInput input)");
    expect(workflow.content).toContain("        await Workflow.ExecuteActivityAsync(\n            () => ChargeActivities.VoidChargeAsync(input),");
    expect(worker.content).not.toContain("new ChargeActivities()");
    expect(worker.content).toContain(".AddActivity(ChargeActivities.VoidChargeAsync)");
    expect(starter.content).toContain("        await client.ExecuteWorkflowAsync(");
    expect(starter.content).toContain('Console.WriteLine("Workflow completed.");');
  });
});
