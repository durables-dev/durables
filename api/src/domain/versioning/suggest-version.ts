import type { Detection, Field, TypeFields } from "../../model/detection.js";
import type { Bump, VersionReason, VersionSuggestion } from "../../model/version-suggestion.js";
import { bumpVersion, FIRST_VERSION } from "./semver.js";

// Compares the signature of two revisions of an activity and suggests the next
// version. Pure: both detections are re-derived from code by the caller.
//
//   major  the activity name, the parameters (count, order or type name), a
//          parameter's same-file dataclass fields, or the output type or its
//          fields changed
//   minor  the signature is unchanged, but the detected non-retryable error
//          types or environment variables differ
//   patch  otherwise
//
// The highest applicable bump wins, and every reason that applies is listed.

const BUMP_ORDER: Bump[] = ["patch", "minor", "major"];

/**
 * Field comparison is a shortcut: fields are known only for Python dataclasses
 * in the same file (TypeScript and .NET compare type names only), and every
 * field change counts as major, even an added field with a default.
 */
// POC-SHORTCUT: SC-020
export function suggestVersion(
  previous: Detection | null,
  current: Detection,
  previousVersion: string | null,
): Omit<VersionSuggestion, "name"> {
  if (!previous || !previousVersion) {
    return { previousVersion: null, suggestedVersion: FIRST_VERSION, bump: "first", reasons: [] };
  }

  const reasons: VersionReason[] = [
    ...activityNameReasons(previous, current),
    ...parameterReasons(previous, current),
    ...outputReasons(previous, current),
    ...setReasons("non-retryable-errors", "non-retryable error types", previous.nonRetryableErrorTypes, current.nonRetryableErrorTypes),
    ...setReasons("env-vars", "environment variables", previous.envVars, current.envVars),
  ];
  if (reasons.length === 0) {
    reasons.push({
      bump: "patch",
      kind: "unchanged",
      message: "The signature, the non-retryable error types and the environment variables are all unchanged.",
    });
  }

  const bump = reasons.map((reason) => reason.bump).reduce((a, b) => (BUMP_ORDER.indexOf(b) > BUMP_ORDER.indexOf(a) ? b : a));
  return { previousVersion, suggestedVersion: bumpVersion(previousVersion, bump), bump, reasons };
}

function activityNameReasons(previous: Detection, current: Detection): VersionReason[] {
  if (previous.activityName.value === current.activityName.value) return [];
  return [
    {
      bump: "major",
      kind: "activity-name",
      message: `The activity name changed from ${previous.activityName.value} to ${current.activityName.value}, so workflows calling it by name will fail.`,
      line: current.activityName.line,
    },
  ];
}

function parameterReasons(previous: Detection, current: Detection): VersionReason[] {
  const before = previous.inputTypes.map((input) => input.type);
  const after = current.inputTypes.map((input) => input.type);
  if (before.length !== after.length || before.some((type, index) => type !== after[index])) {
    return [
      {
        bump: "major",
        kind: "parameters",
        message: `The parameters changed from (${before.join(", ")}) to (${after.join(", ")}).`,
        line: current.inputTypes[0]?.line ?? current.activityName.line,
      },
    ];
  }
  // Same types in the same order: compare each one's fields, where both sides know them.
  return current.inputTypes.flatMap((input, index) => {
    const change = describeFieldChange(input.type, previous.inputTypes[index], input);
    return change
      ? [{ bump: "major" as const, kind: "input-fields" as const, message: `The input type changed: ${change}.`, line: input.typeLine ?? input.line }]
      : [];
  });
}

function outputReasons(previous: Detection, current: Detection): VersionReason[] {
  const before = previous.outputType;
  const after = current.outputType;
  if (before.value !== after.value) {
    return [
      {
        bump: "major",
        kind: "output-type",
        message: `The output type changed from ${before.value} to ${after.value}.`,
        line: after.line,
      },
    ];
  }
  const change = describeFieldChange(after.value, before, after);
  return change
    ? [{ bump: "major", kind: "output-type", message: `The output type changed: ${change}.`, line: after.typeLine ?? after.line }]
    : [];
}

/**
 * Describes how a type's fields changed, or returns null when they didn't (or
 * when either side's fields are unknown). For example: "ChargeCardInput no
 * longer has amount_cents (int) or currency (str), and has a new field amount (Money)".
 */
function describeFieldChange(typeName: string, before: TypeFields, after: TypeFields): string | null {
  if (!before.fields || !after.fields) return null;
  const previous = new Map(before.fields.map((field) => [field.name, field]));
  const current = new Map(after.fields.map((field) => [field.name, field]));
  const removed = before.fields.filter((field) => !current.has(field.name));
  const added = after.fields.filter((field) => !previous.has(field.name));
  const retyped = after.fields.filter((field) => previous.has(field.name) && previous.get(field.name)!.type !== field.type);
  if (removed.length + added.length + retyped.length === 0) return null;

  const parts: string[] = [];
  if (removed.length > 0) parts.push(`no longer has ${list(removed.map(fieldLabel), "or")}`);
  if (added.length > 0) parts.push(`has ${added.length === 1 ? "a new field" : "new fields"} ${list(added.map(fieldLabel), "and")}`);
  if (retyped.length > 0) {
    parts.push(
      `changes the type of ${list(
        retyped.map((field) => `${field.name} from ${previous.get(field.name)!.type} to ${field.type}`),
        "and",
      )}`,
    );
  }
  return `${typeName} ${list(parts, "and", ", ")}`;
}

function setReasons(
  kind: "non-retryable-errors" | "env-vars",
  label: string,
  before: { value: string; line: number }[],
  after: { value: string; line: number }[],
): VersionReason[] {
  const previous = new Set(before.map((item) => item.value));
  const current = new Set(after.map((item) => item.value));
  const added = after.filter((item) => !previous.has(item.value));
  const removed = before.filter((item) => !current.has(item.value));
  if (added.length === 0 && removed.length === 0) return [];
  const parts: string[] = [];
  if (added.length > 0) parts.push(`added ${list(added.map((item) => item.value), "and")}`);
  if (removed.length > 0) parts.push(`removed ${list(removed.map((item) => item.value), "and")}`);
  return [{ bump: "minor", kind, message: `The ${label} changed: ${parts.join("; ")}.`, ...(added[0] ? { line: added[0].line } : {}) }];
}

function fieldLabel(field: Field): string {
  return `${field.name} (${field.type})`;
}

/** ["a"] → "a"; ["a", "b"] → "a or b"; ["a", "b", "c"] → "a, b or c". `beforeLast` is ", " for "a, and b". */
function list(items: string[], conjunction: "and" | "or", beforeLast = " "): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}${beforeLast}${conjunction} ${items.at(-1)}`;
}
