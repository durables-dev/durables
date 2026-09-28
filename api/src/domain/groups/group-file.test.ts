import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ActivityVersion } from "../../model/activity-version.js";
import type { Check } from "../../model/check.js";
import { parseGroupSource, renderGroupFile, type Resolution } from "./group-file.js";

const fixture = (file: string) => readFileSync(new URL(`../../../test-fixtures/python/${file}`, import.meta.url), "utf8");

const chargeChecks: Check[] = [
  { tag: "idempotency", status: "present", established: "pattern-matched", lines: [38], matchedLines: [38] },
  { tag: "compensation", status: "present", established: "declared", address: "durables.dev/kisasa/refund-charge" },
  { tag: "heartbeat", status: "not-applicable", established: "declared", reason: "short" },
  { tag: "non-retryable-errors", status: "present", established: "detected", lines: [44], errorTypes: ["CardDeclined"] },
];

function doc(name: string, file: string, checks: Check[] = chargeChecks): ActivityVersion {
  return {
    owner: "kisasa",
    name,
    version: "1.0.0",
    publishedAt: "2026-09-28T19:00:00.000Z",
    sdk: "python",
    code: fixture(file),
    detection: {} as ActivityVersion["detection"],
    declarations: {} as ActivityVersion["declarations"],
    checks,
    readme: "",
    exampleInput: {},
  };
}

const publisher = { handle: "kisasa", displayName: "Kisasa", verified: true };
const docs: Record<string, ActivityVersion> = {
  "charge-card": doc("charge-card", "charge_card.py"),
  "refund-charge": doc("refund-charge", "refund_charge.py", [
    { tag: "idempotency", status: "present", established: "pattern-matched", lines: [35], matchedLines: [35] },
    { tag: "compensation", status: "not-applicable", established: "declared" },
    { tag: "heartbeat", status: "not-applicable", established: "declared", reason: "short" },
    { tag: "non-retryable-errors", status: "present", established: "detected", lines: [41], errorTypes: ["ChargeNotFound"] },
  ]),
};

function resolve(source: string) {
  const segments = parseGroupSource(source);
  const resolutions: (Resolution | undefined)[] = segments.map((segment) => {
    if (segment.kind !== "address" && segment.kind !== "block") return undefined;
    const found = docs[segment.address.name];
    return found
      ? { ok: true, doc: found, publisher }
      : { ok: false, kind: "unknown-address", message: `${segment.text.trim()} is not a published activity.` };
  });
  return renderGroupFile("python", segments, resolutions);
}

describe("renderGroupFile", () => {
  const pasted = "durables.dev/kisasa/charge-card\ndurables.dev/kisasa/refund-charge";

  it("resolves pasted addresses to pinned blocks under merged imports", () => {
    const result = resolve(pasted);
    expect(result.file).toMatchSnapshot();
    expect(result.members.map((m) => m.address)).toEqual([
      "durables.dev/kisasa/charge-card@1.0.0",
      "durables.dev/kisasa/refund-charge@1.0.0",
    ]);
    expect(result.problems).toEqual([]);
    expect(result.strayLines).toEqual([]);
    const lines = result.file.split("\n");
    expect(lines.filter((line) => line === "import asyncio")).toHaveLength(1);
    expect(lines.at(-1)).toBe("");
    for (const range of result.readOnlyRanges.slice(1)) {
      expect(lines[range.startLine - 1]).toMatch(/^# ── durables\.dev\//);
      expect(lines[range.endLine - 1]).toMatch(/^# ── end durables\.dev\//);
    }
  });

  it("is stable when its own file is sent back", () => {
    const first = resolve(pasted);
    expect(resolve(first.file)).toEqual(first);
  });

  it("resolves an address typed on the empty line after the last block", () => {
    const one = resolve("durables.dev/kisasa/charge-card");
    const two = resolve(one.file.replace(/\n$/, "\ndurables.dev/kisasa/refund-charge"));
    expect(two.file).toBe(resolve(pasted).file);
  });

  it("leaves text being typed alone", () => {
    const one = resolve("durables.dev/kisasa/charge-card");
    const typing = `${one.file}durables.dev/kis`;
    expect(resolve(typing).file).toBe(typing);
  });

  it("flags an unknown address on its line and keeps it editable", () => {
    const result = resolve("durables.dev/kisasa/charge-card\ndurables.dev/kisasa/nope");
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].kind).toBe("unknown-address");
    expect(result.file.split("\n")[result.problems[0].line - 1]).toBe("durables.dev/kisasa/nope");
  });

  it("flags names defined in more than one block", () => {
    const result = resolve("durables.dev/kisasa/charge-card\ndurables.dev/kisasa/charge-card");
    expect(result.problems.filter((p) => p.kind === "name-collision").length).toBeGreaterThan(0);
  });

  it("regenerates a block whose text was tampered with", () => {
    const first = resolve(pasted);
    const tampered = first.file.replace("charge = await", "charge = 'nope'  # await");
    expect(resolve(tampered).file).toBe(first.file);
  });
});
