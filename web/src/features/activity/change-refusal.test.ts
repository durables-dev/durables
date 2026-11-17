import { DetailedError } from "hono/client";
import { describe, expect, test } from "vitest";
import { changeRefusal } from "./change-refusal";

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

describe("changeRefusal", () => {
  test("a 401 means the sign-in has ended", () => {
    expect(changeRefusal(problem(401), ["reason"])).toEqual({
      kind: "signInEnded",
    });
  });

  test("a 400 naming one of the dialog's fields shows the API's message under it", () => {
    const error = problem(400, {
      errors: [{ field: "reason", message: "Enter a reason." }],
    });

    expect(changeRefusal(error, ["reason", "replacement"])).toEqual({
      kind: "rejected",
      field: "reason",
      message: "Enter a reason.",
    });
  });

  test("a 422 naming the replacement shows the API's message under it", () => {
    const error = problem(422, {
      errors: [{ field: "replacement", message: "Choose another version." }],
    });

    expect(changeRefusal(error, ["reason", "replacement"])).toEqual({
      kind: "rejected",
      field: "replacement",
      message: "Choose another version.",
    });
  });

  test("a 400 naming a field the dialog does not show is a failure", () => {
    const error = problem(400, {
      errors: [{ field: "version", message: "Not a version." }],
    });

    expect(changeRefusal(error, ["reason"])).toEqual({ kind: "failed" });
  });

  test("a refusal with fields is a failure where nothing is shown to name", () => {
    const error = problem(422, {
      errors: [{ field: "replacement", message: "Choose another version." }],
    });

    expect(changeRefusal(error)).toEqual({ kind: "failed" });
  });

  test.each([403, 404, 409, 500, 503])("a %i is a failure", (status) => {
    expect(changeRefusal(problem(status), ["reason"])).toEqual({
      kind: "failed",
    });
  });

  test("a response with no Problem Details body is a failure", () => {
    expect(changeRefusal(apiError(502, "Bad gateway"))).toEqual({
      kind: "failed",
    });
  });

  test("a network failure is a failure", () => {
    expect(changeRefusal(new TypeError("Failed to fetch"))).toEqual({
      kind: "failed",
    });
  });
});
