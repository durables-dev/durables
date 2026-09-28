import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pythonDetector } from "../detection/python.js";
import { generatePythonSnippets } from "./python-snippets.js";

const chargeCard = readFileSync(new URL("../../../test-fixtures/python/charge_card.py", import.meta.url), "utf8");
const exampleInput = { amount_cents: 1999, currency: "usd", card_number: "4242424242424242" };

const snippets = generatePythonSnippets({
  name: "charge-card",
  code: chargeCard,
  detection: pythonDetector.detect(chargeCard),
  exampleInput,
});
const tab = (name: string) => snippets.find((s) => s.tab === name)!;

describe("generatePythonSnippets", () => {
  it("returns the five tabs in order", () => {
    expect(snippets.map((s) => [s.tab, s.filename, s.language])).toEqual([
      ["install", undefined, "shell"],
      ["activity", "charge_card.py", "python"],
      ["workflow", "workflow.py", "python"],
      ["worker", "worker.py", "python"],
      ["starter", "starter.py", "python"],
    ]);
    expect(tab("install").content).toBe("pip install temporalio");
    expect(tab("activity").content).toBe(chargeCard);
  });

  it("fills the workflow with the recommended policy and the detected error type", () => {
    const workflow = tab("workflow").content;
    expect(workflow).toContain("    from charge_card import ChargeCardInput, ChargeCardResult, charge_card\n");
    expect(workflow).toContain("class ChargeCardWorkflow:");
    expect(workflow).toContain("async def run(self, input: ChargeCardInput) -> ChargeCardResult:");
    expect(workflow).toContain("            charge_card,\n            input,\n            start_to_close_timeout=timedelta(seconds=30),");
    expect(workflow).toContain('non_retryable_error_types=["CardDeclined"],');
    expect(workflow).not.toContain("{{");
    expect(workflow).not.toContain("from typing");
  });

  it("registers both on the listing's task queue, with no executor for an async activity", () => {
    const worker = tab("worker").content;
    expect(worker).toContain('TASK_QUEUE = "charge-card"');
    expect(worker).toContain("from charge_card import charge_card\nfrom workflow import ChargeCardWorkflow");
    expect(worker).toContain("        activities=[charge_card],\n    )");
    expect(worker).not.toContain("ThreadPoolExecutor");
  });

  it("builds the starter input from the example input", () => {
    const starter = tab("starter").content;
    expect(starter).toContain("from charge_card import ChargeCardInput\n");
    expect(starter).toContain(
      '        ChargeCardInput(\n            amount_cents=1999,\n            currency="usd",\n            card_number="4242424242424242",\n        ),\n',
    );
    expect(starter).toContain('id=f"charge-card-{uuid.uuid4()}"');
  });

  it("adds a thread pool for a synchronous activity", () => {
    const sync = chargeCard.replace("async def charge_card", "def charge_card");
    const [, , , worker] = generatePythonSnippets({
      name: "charge-card",
      code: sync,
      detection: pythonDetector.detect(sync),
      exampleInput,
    });
    expect(worker.content).toContain("from concurrent.futures import ThreadPoolExecutor");
    expect(worker.content).toContain("activity_executor=ThreadPoolExecutor(max_workers=10),");
  });
});
