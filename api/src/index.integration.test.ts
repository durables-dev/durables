import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp } from "./index";

const problemContentType = "application/problem+json";

// The security headers secureHeaders() sets, checked on every kind of response.
const expectSecurityHeaders = (response: Response) => {
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  expect(response.headers.get("Strict-Transport-Security")).toContain(
    "max-age=",
  );
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
    "same-origin",
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Worker", () => {
  test("answers an unknown API route with a Problem Details 404", async () => {
    const response = await exports.default.fetch(
      "http://localhost/api/no-such-route",
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(await response.json()).toMatchObject({
      type: "about:blank",
      title: "Not Found",
      status: 404,
    });
    expectSecurityHeaders(response);
  });

  test("sets the security headers on a successful response", async () => {
    const response = await exports.default.fetch("http://localhost/api/health");

    expect(response.status).toBe(200);
    expectSecurityHeaders(response);
  });

  test("refuses a write from a foreign origin with a Problem Details 403", async () => {
    const response = await exports.default.fetch(
      "http://localhost/api/health",
      {
        method: "POST",
        headers: { "Sec-Fetch-Site": "cross-site" },
      },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expectSecurityHeaders(response);
  });

  test("refuses a write with no Sec-Fetch-Site header", async () => {
    const response = await exports.default.fetch(
      "http://localhost/api/health",
      {
        method: "DELETE",
      },
    );

    expect(response.status).toBe(403);
  });

  test("lets a same-origin write through to routing", async () => {
    const response = await exports.default.fetch(
      "http://localhost/api/health",
      {
        method: "POST",
        headers: { "Sec-Fetch-Site": "same-origin" },
      },
    );

    // No POST route exists, so passing the check reaches the 404.
    expect(response.status).toBe(404);
  });
});

describe("the foundation under a route", () => {
  const handler = vi.fn(() => new Response(null, { status: 204 }));

  const app = createApp()
    .get("/api/test/throws", () => {
      throw new Error("internal detail that must not leak");
    })
    .post("/api/test/write", handler)
    .get("/api/test/storage", async (c) =>
      c.json({ available: await c.var.storage.isAvailable() }),
    );

  test("answers a thrown error with a Problem Details 500 and no internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await app.request("/api/test/throws", {}, env);

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
    });
    expect(body).not.toContain("internal detail");
    expect(body).not.toContain("at ");
    expectSecurityHeaders(response);
  });

  test("logs the unexpected error with the request ID", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await app.request(
      "/api/test/throws",
      { headers: { "cf-ray": "test-ray-id" } },
      env,
    );

    expect(log.mock.calls[0]?.[0]).toMatchObject({ requestId: "test-ray-id" });
  });

  test("does not run the handler for a foreign write", async () => {
    handler.mockClear();

    const response = await app.request(
      "/api/test/write",
      { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } },
      env,
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  test("runs the handler for a same-origin write", async () => {
    handler.mockClear();

    const response = await app.request(
      "/api/test/write",
      { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" } },
      env,
    );

    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
    expectSecurityHeaders(response);
  });

  test("gives a handler the database through c.var.storage", async () => {
    const response = await app.request("/api/test/storage", {}, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
  });
});
