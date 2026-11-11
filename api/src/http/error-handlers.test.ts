import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AppEnv } from "../app-env";
import { notFound, onError } from "./error-handlers";
import { problemContentType, ProblemError } from "./problem";

const appThrowing = (error: unknown) =>
  new Hono<AppEnv>()
    .get("/", () => {
      throw error;
    })
    .notFound(notFound)
    .onError(onError);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notFound", () => {
  test("answers an unknown route with a Problem Details 404", async () => {
    const response = await appThrowing(new Error()).request("/nowhere");

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(await response.json()).toMatchObject({
      type: "about:blank",
      title: "Not Found",
      status: 404,
    });
  });
});

describe("onError", () => {
  test("answers a thrown error with a Problem Details 500 and no internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await appThrowing(
      new Error("secret internal message"),
    ).request("/");

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
    });
    expect(body).not.toContain("secret internal message");
    expect(body).not.toContain("error-handlers");
  });

  test("logs an unexpected error as one structured object", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await appThrowing(new Error("boom")).request("/");

    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      message: "Unexpected error",
      error: { name: "Error", message: "boom" },
    });
  });

  test("answers a ProblemError with its own Problem Details", async () => {
    const response = await appThrowing(
      new ProblemError({ status: 409, detail: "Taken." }),
    ).request("/");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Taken.",
    });
  });

  test("keeps the status of a 4xx HTTPException without its message", async () => {
    const response = await appThrowing(
      new HTTPException(413, { message: "internal limit detail" }),
    ).request("/");

    expect(response.status).toBe(413);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ status: 413 });
    expect(body).not.toContain("internal limit detail");
  });

  test("treats a 5xx HTTPException as unexpected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await appThrowing(new HTTPException(503)).request("/");

    expect(response.status).toBe(500);
  });
});
