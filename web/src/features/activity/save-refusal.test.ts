import { DetailedError } from "hono/client";
import { describe, expect, test } from "vitest";
import { saveRefusal } from "./save-refusal";

function apiError(status: number, data: unknown) {
  return new DetailedError(`${status} Error`, {
    statusCode: status,
    detail: { data, statusText: "Error" },
  });
}

function problem(status: number, extra: object = {}) {
  return apiError(status, {
    type: "about:blank",
    title: "Refused",
    status,
    ...extra,
  });
}

describe("saveRefusal", () => {
  test("a 401 means the sign-in has ended", () => {
    expect(saveRefusal(problem(401))).toEqual({ kind: "signInEnded" });
  });

  test("a 400 naming the description shows the API's message under the field", () => {
    const error = problem(400, {
      errors: [{ field: "description", message: "Enter a description." }],
    });

    expect(saveRefusal(error)).toEqual({
      kind: "rejected",
      message: "Enter a description.",
    });
  });

  test("a 400 that names no description field is a failure", () => {
    expect(saveRefusal(problem(400))).toEqual({ kind: "failed" });
  });

  test.each([403, 404, 500, 503])("a %i is a failure", (status) => {
    expect(saveRefusal(problem(status))).toEqual({ kind: "failed" });
  });

  test("a response with no Problem Details body is a failure", () => {
    expect(saveRefusal(apiError(502, "Bad gateway"))).toEqual({
      kind: "failed",
    });
  });

  test("a network failure is a failure", () => {
    expect(saveRefusal(new TypeError("Failed to fetch"))).toEqual({
      kind: "failed",
    });
  });
});
