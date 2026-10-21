import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AppEnv } from "../app-env";
import { onError } from "../http/error-handlers";
import { problemContentType } from "../http/problem";
import {
  type SessionChanges,
  type SessionIdentity,
  sessionLifetimeSeconds,
} from "./auth";
import { auth } from "./auth-middleware";

const signingKey = "unit-test-signing-key";
const email = "ada@example.com";

const identity: SessionIdentity = {
  provider: "github",
  providerAccountId: "1234",
  name: "Ada Lovelace",
  email,
  avatarUrl: "https://example.com/ada.png",
};

// A bare app around the auth middleware. Its routes stand in for the handlers that start,
// read, change and end a session.
const authApp = () =>
  new Hono<AppEnv>()
    .use(auth())
    .post("/start", async (c) => {
      await c.var.auth.start(await c.req.json<SessionIdentity>());
      return c.body(null, 204);
    })
    .get("/read", async (c) => c.json({ session: await c.var.auth.session() }))
    .put("/update", async (c) =>
      c.json(await c.var.auth.update(await c.req.json<SessionChanges>())),
    )
    .delete("/end", (c) => {
      c.var.auth.end();
      return c.body(null, 204);
    })
    .onError(onError);

type Env = Partial<Pick<CloudflareBindings, "SESSION_SIGNING_KEY">>;

const withKey: Env = {
  SESSION_SIGNING_KEY: signingKey as CloudflareBindings["SESSION_SIGNING_KEY"],
};

const send = (
  path: string,
  init: RequestInit = {},
  env: Env = withKey,
): Promise<Response> => Promise.resolve(authApp().request(path, init, env));

/** The name=value part of a Set-Cookie header, ready to send back as a Cookie header. */
const cookiePair = (response: Response): string =>
  (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";

const signIn = async (env: Env = withKey): Promise<string> => {
  const response = await send(
    "/start",
    { method: "POST", body: JSON.stringify(identity) },
    env,
  );
  expect(response.status).toBe(204);
  return cookiePair(response);
};

const read = async (cookie: string, env: Env = withKey) => {
  const response = await send("/read", { headers: { Cookie: cookie } }, env);
  return response.json<{ session?: Record<string, unknown> }>();
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("issuing a session", () => {
  test("sets a __Host- cookie that is HttpOnly, Secure and SameSite=Lax", async () => {
    const response = await send("/start", {
      method: "POST",
      body: JSON.stringify(identity),
    });

    const header = response.headers.get("Set-Cookie") ?? "";
    expect(header).toMatch(/^__Host-session=/);
    const attributes = header.split("; ").slice(1);
    expect(attributes).toEqual(
      expect.arrayContaining([
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Path=/",
        `Max-Age=${String(sessionLifetimeSeconds)}`,
      ]),
    );
    expect(header).not.toContain("Domain=");
  });

  test("starts with the identity and no handle, and reads back", async () => {
    const cookie = await signIn();

    expect((await read(cookie)).session).toMatchObject({
      ...identity,
      handle: null,
    });
  });
});

describe("reading a session", () => {
  test("is anonymous with no cookie", async () => {
    expect((await read("")).session).toBeUndefined();
  });

  test("is anonymous when the signed value was tampered with", async () => {
    const cookie = await signIn();
    const [name, value = ""] = cookie.split("=");
    const decoded = decodeURIComponent(value);
    const tampered = decoded.replace('"name":"Ada Lovelace"', '"name":"Eve"');
    expect(tampered).not.toBe(decoded);

    expect(
      (await read(`${name ?? ""}=${encodeURIComponent(tampered)}`)).session,
    ).toBeUndefined();
  });

  test("is anonymous when the cookie was signed with another key", async () => {
    const cookie = await signIn({
      SESSION_SIGNING_KEY:
        "another-key" as CloudflareBindings["SESSION_SIGNING_KEY"],
    });

    expect((await read(cookie)).session).toBeUndefined();
  });

  test("is anonymous when the cookie is not a signed value", async () => {
    expect((await read("__Host-session=not-signed")).session).toBeUndefined();
  });

  test("is anonymous once the session has expired, even if the browser still sends it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const cookie = await signIn();

    vi.setSystemTime(
      new Date(Date.now() + (sessionLifetimeSeconds - 1) * 1000),
    );
    expect((await read(cookie)).session).toBeDefined();

    vi.setSystemTime(new Date(Date.now() + 1000));
    expect((await read(cookie)).session).toBeUndefined();
  });

  test("never logs the email", async () => {
    const logged = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => undefined),
    );

    const cookie = await signIn();
    await read(cookie);
    await read(`${cookie}tampered`);
    await read(cookie, {});

    for (const spy of logged) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(email);
    }
  });
});

describe("updating a session", () => {
  test("changes the handle and keeps the original expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const cookie = await signIn();
    const before = (await read(cookie)).session;

    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const response = await send("/update", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({ handle: "ada" }),
    });

    expect(response.status).toBe(200);
    const after = (await read(cookiePair(response))).session;
    expect(after).toMatchObject({ ...identity, handle: "ada" });
    expect(after?.["expiresAt"]).toBe(before?.["expiresAt"]);
    expect(response.headers.get("Set-Cookie")).toContain(
      `Max-Age=${String(sessionLifetimeSeconds - 24 * 60 * 60)}`,
    );
  });

  test("answers 401 Problem Details with no session", async () => {
    const response = await send("/update", {
      method: "PUT",
      body: JSON.stringify({ handle: "ada" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
  });
});

describe("ending a session", () => {
  test("clears the cookie with the same attributes", async () => {
    const cookie = await signIn();

    const response = await send("/end", {
      method: "DELETE",
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(204);
    const header = response.headers.get("Set-Cookie") ?? "";
    expect(header).toMatch(/^__Host-session=;/);
    expect(header.split("; ")).toEqual(
      expect.arrayContaining([
        "Max-Age=0",
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
      ]),
    );
  });

  test("clears the cookie when there is no session", async () => {
    const response = await send("/end", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(/^__Host-session=;/);
  });
});

describe("with no signing key", () => {
  test.each([
    ["reading", "/read", { headers: { Cookie: "__Host-session=x.y" } }],
    ["starting", "/start", { method: "POST", body: JSON.stringify(identity) }],
    ["updating", "/update", { method: "PUT", body: '{"handle":"ada"}' }],
  ])(
    "fails closed when %s a session",
    async (_action, path, init: RequestInit) => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await send(path, init, {});

      expect(response.status).toBe(503);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(await response.json()).toMatchObject({
        status: 503,
        title: "Service Unavailable",
      });
      expect(log).toHaveBeenCalledOnce();
    },
  );

  test("treats an empty key as missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await send(
      "/read",
      {},
      {
        SESSION_SIGNING_KEY: "" as CloudflareBindings["SESSION_SIGNING_KEY"],
      },
    );

    expect(response.status).toBe(503);
  });

  test("still signs out", async () => {
    const response = await send("/end", { method: "DELETE" }, {});

    expect(response.status).toBe(204);
  });
});
