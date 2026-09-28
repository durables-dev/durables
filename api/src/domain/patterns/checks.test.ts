import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Declarations } from "../../model/check.js";
import { pythonDetector } from "../detection/python.js";
import { buildChecks } from "./checks.js";
import { PYTHON_IDEMPOTENCY } from "./rubric.js";

const chargeCard = readFileSync(new URL("../../../test-fixtures/python/charge_card.py", import.meta.url), "utf8");
const detection = pythonDetector.detect(chargeCard);
const noErrors = { ...detection, nonRetryableErrorTypes: [] };

const declarations = (lines: number[]): Declarations => ({
  idempotency: { status: "present", lines },
  compensation: { status: "present", address: "durables.dev/kisasa/refund-charge" },
  heartbeat: { status: "not-applicable", reason: "one short call" },
  envVars: [],
});

describe("buildChecks", () => {
  it("pattern-matches the line that sends the Idempotency-Key header", () => {
    const [idempotency, compensation, heartbeat] = buildChecks(chargeCard, declarations([37, 55]), detection, PYTHON_IDEMPOTENCY);
    expect(idempotency).toEqual({
      tag: "idempotency",
      status: "present",
      established: "pattern-matched",
      lines: [37, 55],
      matchedLines: [37],
      rubricTag: "idempotency",
    });
    expect(compensation).toMatchObject({ established: "declared", address: "durables.dev/kisasa/refund-charge" });
    expect(heartbeat).toMatchObject({ status: "not-applicable", established: "declared", reason: "one short call" });
  });

  it("stays declared when no cited line matches", () => {
    const [idempotency] = buildChecks(chargeCard, declarations([55, 999]), detection, PYTHON_IDEMPOTENCY);
    expect(idempotency).toMatchObject({ established: "declared", matchedLines: [] });
  });

  it("matches the other header and keyword forms", () => {
    const code = ['headers = {"Idempotency-Key": key}', "headers['idempotency-key'] = key", "stripe.Charge.create(amount=1, idempotency_key=key)", "idempotency_key = make_key()"].join("\n");
    const [idempotency] = buildChecks(code, declarations([1, 2, 3, 4]), noErrors, PYTHON_IDEMPOTENCY);
    expect(idempotency.matchedLines).toEqual([1, 2, 3]);
  });

  it("adds a detected non-retryable-errors check with the lines each type was found on", () => {
    const checks = buildChecks(chargeCard, declarations([37]), detection, PYTHON_IDEMPOTENCY);
    expect(checks.find((check) => check.tag === "non-retryable-errors")).toEqual({
      tag: "non-retryable-errors",
      status: "present",
      established: "detected",
      lines: [43],
      errorTypes: ["CardDeclined"],
    });
    const none = buildChecks(chargeCard, declarations([37]), noErrors, PYTHON_IDEMPOTENCY);
    expect(none.find((check) => check.tag === "non-retryable-errors")).toMatchObject({ status: "absent", established: "detected", lines: [] });
  });
});
