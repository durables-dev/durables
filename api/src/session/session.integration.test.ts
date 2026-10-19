import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SessionIdentity } from "../auth/auth";
import { createApp } from "../index";
import { seedAccount } from "../storage/seed";
import { session } from "./session";

const problemContentType = "application/problem+json";

// The provider callbacks are later stories. Until they land, this test-only route starts a
// session through the auth interface, the same way they will. The cookie it issues is signed
// with the Worker's own key, so the real Worker reads it.
const testApp = createApp()
  .route("/api/session", session)
  .post("/api/test/sign-in", async (c) => {
    await c.var.auth.start(await c.req.json<SessionIdentity>());
    return c.body(null, 204);
  });

const identity = (
  overrides: Partial<SessionIdentity> = {},
): SessionIdentity => ({
  provider: "google",
  providerAccountId: `google-${crypto.randomUUID()}`,
  name: "Ada Lovelace",
  email: "ada@example.com",
  avatarUrl: "https://example.com/ada.png",
  ...overrides,
});

/** Signs in as the identity and returns the cookie to send back. */
const signIn = async (as: SessionIdentity): Promise<string> => {
  const response = await testApp.request(
    "/api/test/sign-in",
    {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify(as),
    },
    env,
  );
  expect(response.status).toBe(204);
  return (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
};

const readSession = (cookie?: string) =>
  exports.default.fetch("http://localhost/api/session", {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });

const signOut = (cookie?: string) =>
  exports.default.fetch("http://localhost/api/session", {
    method: "DELETE",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/session", () => {
  test("answers 200 with no user when no cookie is sent", async () => {
    const response = await readSession();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns name, initials, provider, suggestion, handle and account-exists, and no email", async () => {
    const cookie = await signIn(identity({ name: "David Dieruf" }));

    const response = await readSession(cookie);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      user: {
        name: "David Dieruf",
        initials: "DD",
        provider: "google",
        suggestedHandle: "ada",
        handle: null,
        accountExists: false,
      },
    });
    expect(body).not.toContain("ada@example.com");
    expect(body).not.toContain("example.com");
    expect(body).not.toContain("avatar");
    expect(body).not.toContain("providerAccountId");
  });

  test("leaves the suggestion out when the email cleans to under 3 characters", async () => {
    const cookie = await signIn(identity({ email: "a.@example.com" }));

    const { user } = await (
      await readSession(cookie)
    ).json<{
      user: Record<string, unknown>;
    }>();

    expect(user).toMatchObject({ provider: "google" });
    expect(user).not.toHaveProperty("suggestedHandle");
  });

  test("reports that an account exists for a linked provider identity", async () => {
    const seeded = await seedAccount(env.DB, { provider: "microsoft" });
    const cookie = await signIn(
      identity({
        provider: "microsoft",
        providerAccountId: seeded.providerAccountId,
      }),
    );

    const response = await readSession(cookie);

    expect(await response.json()).toMatchObject({
      user: { provider: "microsoft", accountExists: true },
    });
  });

  test("reports no account when the same ID is linked under another provider", async () => {
    const seeded = await seedAccount(env.DB, { provider: "github" });
    const cookie = await signIn(
      identity({
        provider: "gitlab",
        providerAccountId: seeded.providerAccountId,
      }),
    );

    expect(await (await readSession(cookie)).json()).toMatchObject({
      user: { accountExists: false },
    });
  });

  test("treats a cookie with an invalid signature as anonymous", async () => {
    const cookie = await signIn(identity());
    const [name, value = ""] = cookie.split("=");
    const decoded = decodeURIComponent(value);
    const forged = decoded.replace(
      '"provider":"google"',
      '"provider":"github"',
    );
    expect(forged).not.toBe(decoded);

    const response = await readSession(
      `${name ?? ""}=${encodeURIComponent(forged)}`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  test("treats an expired cookie as anonymous", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const cookie = await signIn(identity());
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));

    const response = await testApp.request(
      "/api/session",
      { headers: { Cookie: cookie } },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  test("fails closed with Problem Details when the signing key is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await testApp.request(
      "/api/session",
      {},
      {
        ...env,
        SESSION_SIGNING_KEY: undefined,
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(await response.json()).toMatchObject({ status: 503 });
  });

  test("never logs the email", async () => {
    const logged = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const cookie = await signIn(
      identity({ email: "never-logged@example.com" }),
    );

    await readSession(cookie);
    await readSession(`${cookie}x`);

    for (const spy of logged) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(
        "never-logged@example.com",
      );
    }
  });
});

describe("DELETE /api/session", () => {
  test("clears the cookie and answers 204 for a signed-in publisher", async () => {
    const cookie = await signIn(identity());

    const response = await signOut(cookie);

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const cleared = response.headers.get("Set-Cookie") ?? "";
    expect(cleared).toMatch(/^__Host-session=;/);
    expect(cleared).toContain("Max-Age=0");

    const after = await readSession(cleared.split(";")[0]);
    expect(await after.json()).toEqual({ user: null });
  });

  test("answers 204 when already signed out", async () => {
    const response = await signOut();

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(/^__Host-session=;/);
  });

  test("is refused from another origin", async () => {
    const response = await exports.default.fetch(
      "http://localhost/api/session",
      { method: "DELETE", headers: { "Sec-Fetch-Site": "cross-site" } },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("the issued cookie", () => {
  test("is HttpOnly, Secure and SameSite=Lax", async () => {
    const response = await testApp.request(
      "/api/test/sign-in",
      {
        method: "POST",
        headers: { "Sec-Fetch-Site": "same-origin" },
        body: JSON.stringify(identity()),
      },
      env,
    );

    const attributes = (response.headers.get("Set-Cookie") ?? "").split("; ");
    expect(attributes[0]).toMatch(/^__Host-session=/);
    expect(attributes).toEqual(
      expect.arrayContaining(["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]),
    );
  });
});
