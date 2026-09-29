import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pythonDetector } from "./python.js";

const chargeCard = readFileSync(new URL("../../../test-fixtures/python/charge_card.py", import.meta.url), "utf8");

describe("pythonDetector", () => {
  it("detects the charge_card sample", () => {
    expect(pythonDetector.detect(chargeCard)).toEqual({
      sdk: { value: "python", line: 8 },
      activityName: { value: "charge_card", line: 51 },
      inputTypes: [
        {
          name: "input",
          type: "ChargeCardInput",
          line: 52,
          typeLine: 13,
          fields: [
            { name: "amount_cents", type: "int", line: 14 },
            { name: "currency", type: "str", line: 15 },
            { name: "card_number", type: "str", line: 16 },
          ],
        },
      ],
      outputType: {
        value: "ChargeCardResult",
        line: 52,
        typeLine: 20,
        fields: [
          { name: "charge_id", type: "str", line: 21 },
          { name: "status", type: "str", line: 22 },
        ],
      },
      nonRetryableErrorTypes: [{ value: "CardDeclined", line: 43 }],
      envVars: [
        { value: "MOCK_PAYMENTS_URL", line: 26 },
        { value: "MOCK_PAYMENTS_API_KEY", line: 36 },
      ],
    });
  });

  it("falls back to the function name and handles multi-line signatures, defaults and getenv", () => {
    const code = [
      "import temporalio.activity as activity", // 1
      "import os", // 2
      "# os.getenv('COMMENTED_OUT')", // 3
      "@activity.defn", // 4
      "def send_email(", // 5
      "    to: str,", // 6
      "    retries: dict[str, int] = {'a': 1},", // 7
      ") -> None:", // 8
      "    host = os.getenv('SMTP_HOST', 'localhost')", // 9
      "    port = os.environ.get(\"SMTP_PORT\")", // 10
      "    again = os.getenv('SMTP_HOST')", // 11
    ].join("\n");
    const detection = pythonDetector.detect(code);
    expect(detection.sdk.line).toBe(1);
    expect(detection.activityName).toEqual({ value: "send_email", line: 5 });
    expect(detection.inputTypes).toEqual([
      { name: "to", type: "str", line: 6 },
      { name: "retries", type: "dict[str, int]", line: 7 },
    ]);
    expect(detection.outputType).toEqual({ value: "None", line: 8 });
    expect(detection.nonRetryableErrorTypes).toEqual([]);
    expect(detection.envVars).toEqual([
      { value: "SMTP_HOST", line: 9 },
      { value: "SMTP_PORT", line: 10 },
    ]);
  });

  it("lists same-file dataclass fields, skipping docstrings, methods and defaults", () => {
    const code = [
      "import dataclasses", // 1
      "from temporalio import activity", // 2
      "", // 3
      "@dataclasses.dataclass(frozen=True)", // 4
      "class Order:", // 5
      '    """An order.', // 6
      "    total: int  -- not a field", // 7
      '    """', // 8
      "    id: str  # the order id", // 9
      "    lines: list[dict[str, int]] = dataclasses.field(default_factory=list)", // 10
      "", // 11
      "    def total(self) -> int:", // 12
      "        count: int = 0", // 13
      "        return count", // 14
      "", // 15
      "class Plain:", // 16
      "    note: str", // 17
      "", // 18
      "@activity.defn", // 19
      "async def place(order: Order, plain: Plain) -> Plain:", // 20
      "    return plain", // 21
    ].join("\n");
    const detection = pythonDetector.detect(code);
    expect(detection.inputTypes).toEqual([
      {
        name: "order",
        type: "Order",
        line: 20,
        typeLine: 5,
        fields: [
          { name: "id", type: "str", line: 9 },
          { name: "lines", type: "list[dict[str, int]]", line: 10 },
        ],
      },
      { name: "plain", type: "Plain", line: 20 },
    ]);
    expect(detection.outputType).toEqual({ value: "Plain", line: 20 });
  });
});
