import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import type { AppEnv } from "../app-env";
import { onError } from "./error-handlers";
import { problemContentType } from "./problem";
import { fieldErrors, problemOnInvalid } from "./validation";

const schema = z.object({ handle: z.string().min(3), name: z.string() });

const app = new Hono<AppEnv>()
  .get("/", zValidator("query", schema, problemOnInvalid), (c) =>
    c.json(c.req.valid("query")),
  )
  .onError(onError);

describe("problemOnInvalid", () => {
  test("answers a failing request with a Problem Details 400 listing each field", async () => {
    const response = await app.request("/?handle=ab");

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    });
    expect(body).toHaveProperty("errors", [
      { field: "handle", message: expect.any(String) as unknown },
      { field: "name", message: expect.any(String) as unknown },
    ]);
  });

  test("lets a valid request through", async () => {
    const response = await app.request("/?handle=abc&name=x");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ handle: "abc", name: "x" });
  });
});

describe("fieldErrors", () => {
  test("keeps one entry per field, with the first message", () => {
    const result = z
      .object({
        handle: z
          .string()
          .min(3)
          .regex(/^[a-z]+$/),
      })
      .safeParse({ handle: "A" });

    expect(result.success).toBe(false);
    expect(fieldErrors(result.error?.issues ?? [])).toEqual([
      { field: "handle", message: result.error?.issues[0]?.message },
    ]);
  });

  test("joins a nested path with dots", () => {
    const result = z
      .object({ owner: z.object({ handle: z.string() }) })
      .safeParse({ owner: {} });

    expect(fieldErrors(result.error?.issues ?? [])).toEqual([
      { field: "owner.handle", message: expect.any(String) as unknown },
    ]);
  });
});
