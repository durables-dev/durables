import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
import type { AppEnv } from "../app-env";
import { onError } from "./error-handlers";
import { problemContentType } from "./problem";
import { isAllowedRequest, sameOrigin } from "./same-origin";

const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];

const guardedApp = () => {
  const handler = vi.fn(() => new Response(null, { status: 204 }));
  const app = new Hono<AppEnv>()
    .use(sameOrigin())
    .on([...writeMethods, "GET"], "/", handler)
    .onError(onError);
  return { app, handler };
};

const send = (app: Hono<AppEnv>, method: string, site?: string) =>
  app.request("/", {
    method,
    headers: site === undefined ? {} : { "Sec-Fetch-Site": site },
  });

describe("sameOrigin", () => {
  test.each(
    writeMethods.flatMap((m) => [
      [m, "cross-site"],
      [m, "same-site"],
    ]),
  )(
    "refuses %s from a foreign origin (%s) with 403 and does not run the handler",
    async (method, site) => {
      const { app, handler } = guardedApp();

      const response = await send(app, method, site);

      expect(response.status).toBe(403);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
      });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  test.each(writeMethods)(
    "refuses %s with no Sec-Fetch-Site header with 403",
    async (method) => {
      const { app, handler } = guardedApp();

      const response = await send(app, method);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  test.each(writeMethods)(
    "lets %s from our origin reach the handler",
    async (method) => {
      const { app, handler } = guardedApp();

      const response = await send(app, method, "same-origin");

      expect(response.status).toBe(204);
      expect(handler).toHaveBeenCalledOnce();
    },
  );

  test("lets a direct navigation (none) reach the handler", async () => {
    const { app, handler } = guardedApp();

    const response = await send(app, "POST", "none");

    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });

  test.each([["cross-site"], [undefined]])(
    "never blocks a GET (Sec-Fetch-Site %s)",
    async (site) => {
      const { app, handler } = guardedApp();

      const response = await send(app, "GET", site);

      expect(response.status).toBe(204);
      expect(handler).toHaveBeenCalledOnce();
    },
  );
});

describe("isAllowedRequest", () => {
  test("allows reads from anywhere", () => {
    expect(isAllowedRequest("GET", "cross-site")).toBe(true);
    expect(isAllowedRequest("HEAD", undefined)).toBe(true);
  });

  test("checks every other method, whatever its case", () => {
    expect(isAllowedRequest("OPTIONS", "cross-site")).toBe(false);
    expect(isAllowedRequest("post", "cross-site")).toBe(false);
    expect(isAllowedRequest("post", "same-origin")).toBe(true);
  });
});
