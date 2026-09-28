import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Declarations } from "../../model/check.js";
import { dotnetDetector } from "../detection/dotnet.js";
import { typescriptDetector } from "../detection/typescript.js";
import { buildChecks } from "./checks.js";
import { idempotencyRubricFor, RUBRIC } from "./rubric.js";

const fixture = (path: string) => readFileSync(new URL(`../../../test-fixtures/${path}`, import.meta.url), "utf8");
const captureCharge = fixture("typescript/capture-charge.ts");
const voidCharge = fixture("dotnet/VoidCharge.cs");

const declarations = (lines: number[]): Declarations => ({
  idempotency: { status: "present", lines },
  compensation: { status: "absent" },
  heartbeat: { status: "not-applicable", reason: "one short call" },
  envVars: [],
});

describe("the rubric", () => {
  it("has one idempotency entry per SDK, the Python one keeping its anchor", () => {
    expect(RUBRIC.map((entry) => [entry.sdk, entry.anchor])).toEqual([
      ["python", "idempotency"],
      ["typescript", "idempotency-typescript"],
      ["dotnet", "idempotency-dotnet"],
    ]);
  });

  it("pattern-matches the TypeScript seed's header line and links to its own entry", () => {
    const [idempotency] = buildChecks(captureCharge, declarations([17, 25]), typescriptDetector.detect(captureCharge), idempotencyRubricFor("typescript"));
    expect(idempotency).toMatchObject({ established: "pattern-matched", matchedLines: [25], rubricTag: "idempotency-typescript" });
  });

  it("pattern-matches the .NET seed's header line and links to its own entry", () => {
    const [idempotency] = buildChecks(voidCharge, declarations([23, 29]), dotnetDetector.detect(voidCharge), idempotencyRubricFor("dotnet"));
    expect(idempotency).toMatchObject({ established: "pattern-matched", matchedLines: [29], rubricTag: "idempotency-dotnet" });
  });

  it("matches the other TypeScript forms, but not a type annotation", () => {
    const code = [
      'headers.set("Idempotency-Key", key);',
      "headers.append('idempotency-key', key);",
      "await stripe.charges.create(params, { idempotencyKey: key });",
      "type Options = { idempotencyKey: string };",
      'const header = "Idempotency-Key";',
    ].join("\n");
    const detection = { ...typescriptDetector.detect(captureCharge), nonRetryableErrorTypes: [] };
    const [idempotency] = buildChecks(code, declarations([1, 2, 3, 4, 5]), detection, idempotencyRubricFor("typescript"));
    expect(idempotency.matchedLines).toEqual([1, 2, 3]);
  });

  it("matches the other .NET forms", () => {
    const code = [
      'request.Headers.TryAddWithoutValidation("Idempotency-Key", key);',
      "var options = new RequestOptions { IdempotencyKey = key };",
      "public string IdempotencyKey => key;",
      'var header = "Idempotency-Key";',
    ].join("\n");
    const detection = { ...dotnetDetector.detect(voidCharge), nonRetryableErrorTypes: [] };
    const [idempotency] = buildChecks(code, declarations([1, 2, 3, 4]), detection, idempotencyRubricFor("dotnet"));
    expect(idempotency.matchedLines).toEqual([1, 2]);
  });
});
