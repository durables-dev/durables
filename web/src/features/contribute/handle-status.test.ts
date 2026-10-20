import { DetailedError } from "hono/client";
import { describe, expect, test } from "vitest";
import {
  canSaveHandle,
  handleSaveRefusal,
  handleStatus,
  needsLookup,
} from "./handle-status";

function saveError(
  status: number,
  errors?: { field: string; message: string }[],
) {
  return new DetailedError(`${status} Error`, {
    statusCode: status,
    detail: {
      data: { type: "about:blank", title: "Error", status, errors },
      statusText: "Error",
    },
  });
}

const pending = { state: "pending" } as const;

describe("handleStatus", () => {
  test("an empty field asks for a handle", () => {
    expect(handleStatus("", pending)).toEqual({
      kind: "invalid",
      message: "Choose a handle.",
    });
  });

  test("a bad format gives the format message without a lookup", () => {
    for (const handle of ["ab", "-ddieruf", "dd--ieruf", "ddieruf-", "d_d"]) {
      expect(handleStatus(handle, pending)).toEqual({
        kind: "invalid",
        message: "Use 3 to 39 lowercase letters, numbers and single hyphens.",
      });
    }
  });

  test("a reserved word is taken without a lookup", () => {
    expect(handleStatus("admin", pending)).toEqual({
      kind: "taken",
      message: "admin is taken.",
    });
  });

  test("a valid handle reads Checking… while it is looked up", () => {
    expect(handleStatus("ddieruf", pending)).toEqual({
      kind: "checking",
      message: "Checking…",
    });
  });

  test("a valid, free handle is available", () => {
    expect(
      handleStatus("ddieruf", { state: "answered", availability: "available" }),
    ).toEqual({ kind: "available", message: "ddieruf is available." });
  });

  test("a used or retired handle is taken", () => {
    expect(
      handleStatus("ddieruf", { state: "answered", availability: "taken" }),
    ).toEqual({ kind: "taken", message: "ddieruf is taken." });
  });

  test("a failed lookup asks to try again", () => {
    expect(handleStatus("ddieruf", { state: "failed" })).toEqual({
      kind: "failed",
      message: "We couldn't check ddieruf. Try again.",
    });
  });
});

describe("needsLookup", () => {
  test("only a handle the shared rule allows is looked up", () => {
    expect(needsLookup("ddieruf")).toBe(true);
    expect(needsLookup("")).toBe(false);
    expect(needsLookup("ab")).toBe(false);
    expect(needsLookup("temporal")).toBe(false);
  });
});

describe("handleSaveRefusal", () => {
  test("a 409 means the handle is taken", () => {
    expect(handleSaveRefusal("ddieruf", saveError(409))).toEqual({
      kind: "taken",
      message: "ddieruf is taken.",
    });
  });

  test("a 400 shows the handle field's message", () => {
    expect(
      handleSaveRefusal(
        "ddieruf",
        saveError(400, [{ field: "handle", message: "Choose a handle." }]),
      ),
    ).toEqual({ kind: "invalid", message: "Choose a handle." });
  });

  test("a 400 with no field message shows the format message", () => {
    expect(handleSaveRefusal("ddieruf", saveError(400))).toEqual({
      kind: "invalid",
      message: "Use 3 to 39 lowercase letters, numbers and single hyphens.",
    });
  });

  test("any other failure can be saved again", () => {
    const refusal = handleSaveRefusal("ddieruf", saveError(500));
    expect(refusal).toEqual({
      kind: "unsaved",
      message: "Your handle wasn't saved. Try again.",
    });
    expect(canSaveHandle(refusal)).toBe(true);
    expect(
      handleSaveRefusal("ddieruf", new TypeError("Failed to fetch")).kind,
    ).toBe("unsaved");
  });
});

describe("canSaveHandle", () => {
  test("only an available handle can be saved", () => {
    expect(canSaveHandle({ kind: "available", message: "" })).toBe(true);
    for (const kind of ["taken", "invalid", "checking", "failed"] as const) {
      expect(canSaveHandle({ kind, message: "" })).toBe(false);
    }
  });
});
