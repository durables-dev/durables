import { DetailedError } from "hono/client";
import { describe, expect, test } from "vitest";
import { fieldMessage, problemFrom } from "./problem";

function apiError(status: number, data: unknown) {
  return new DetailedError(`${status} Error`, {
    statusCode: status,
    detail: { data, statusText: "Error" },
  });
}

describe("problemFrom", () => {
  test("reads the Problem Details body of a failed response", () => {
    const body = {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "ddieruf is taken.",
      errors: [{ field: "handle", message: "ddieruf is taken." }],
    };

    expect(problemFrom(apiError(409, body))).toEqual(body);
  });

  test("describes a response with no Problem Details body by its status", () => {
    expect(problemFrom(apiError(502, "Bad gateway"))).toEqual({
      type: "about:blank",
      title: "502 Error",
      status: 502,
    });
  });

  test("is undefined for an error that is not an API response", () => {
    expect(problemFrom(new TypeError("Failed to fetch"))).toBeUndefined();
    expect(problemFrom("nope")).toBeUndefined();
  });
});

describe("fieldMessage", () => {
  test("finds the message for the named field", () => {
    const problem = {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      errors: [{ field: "handle", message: "Use 3 to 39 characters." }],
    };

    expect(fieldMessage(problem, "handle")).toBe("Use 3 to 39 characters.");
    expect(fieldMessage(problem, "name")).toBeUndefined();
  });
});
