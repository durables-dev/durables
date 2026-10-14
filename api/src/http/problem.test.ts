import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import {
  problem,
  problemContentType,
  ProblemError,
  problemResponse,
} from "./problem";

describe("problem", () => {
  test("defaults to about:blank with the status phrase as the title", () => {
    expect(problem({ status: 404 })).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
    });
  });

  test("carries detail and field errors when given", () => {
    expect(
      problem({
        status: 400,
        detail: "The request is not valid.",
        errors: [{ field: "handle", message: "Required" }],
      }),
    ).toEqual({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "The request is not valid.",
      errors: [{ field: "handle", message: "Required" }],
    });
  });

  test("keeps a given type and title", () => {
    expect(
      problem({ status: 409, type: "https://durables.dev/x", title: "Taken" }),
    ).toMatchObject({ type: "https://durables.dev/x", title: "Taken" });
  });
});

describe("problemResponse", () => {
  test("answers with the status and the problem+json content type", async () => {
    const app = new Hono().get("/", (c) =>
      problemResponse(c, problem({ status: 409, detail: "Taken." })),
    );

    const response = await app.request("/");

    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Taken.",
    });
  });
});

describe("ProblemError", () => {
  test("carries its Problem Details", () => {
    const error = new ProblemError({ status: 403, detail: "No." });

    expect(error).toBeInstanceOf(Error);
    expect(error.problem).toEqual({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      detail: "No.",
    });
  });
});
