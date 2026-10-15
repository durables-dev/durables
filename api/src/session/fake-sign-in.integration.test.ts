import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, test, vi } from "vitest";
import app, { createProductionApp } from "../index";
import { seedAccount } from "../storage/seed";
import { type FakeIdentity, fakeProviderAccountId } from "./fake-sign-in";

// The fake provider runs in the local Worker, which is what wrangler.toml names (src/dev.ts).
// Requests go to that Worker over HTTP. The production app is built from src/index.ts.

const problemContentType = "application/problem+json";
const fakePath = "/api/session/providers/fake";

const fakeSignIn = (body: unknown, headers: Record<string, string> = {}) =>
  exports.default.fetch(`http://localhost${fakePath}`, {
    method: "POST",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** Signs in through the fake provider and returns the cookie to send back. */
const signInAs = async (identity: FakeIdentity): Promise<string> => {
  const response = await fakeSignIn(identity);
  expect(response.status).toBe(204);
  return (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
};

const readSession = (cookie: string) =>
  exports.default.fetch("http://localhost/api/session", {
    headers: { Cookie: cookie },
  });

/** A name no other test uses, so each test signs in as its own account. */
const uniqueName = (first: string) =>
  `${first} Tester-${crypto.randomUUID().slice(0, 8)}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/session/providers/fake in the local Worker", () => {
  test("issues a valid session cookie for the named identity", async () => {
    const response = await fakeSignIn({ name: uniqueName("Ada") });

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/^__Host-session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  test("issues a session the session endpoint reads, with the name and initials", async () => {
    const cookie = await signInAs({
      name: "Grace Hopper",
      email: "grace.never-returned@example.com",
      provider: "gitlab",
      username: "ghopper",
      providerAccountId: `fake-${crypto.randomUUID()}`,
    });

    const response = await readSession(cookie);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      user: {
        name: "Grace Hopper",
        initials: "GH",
        provider: "gitlab",
        handle: null,
        accountExists: false,
      },
    });
    expect(body).not.toContain("grace.never-returned@example.com");
  });

  test("signs in as GitHub when no provider is named", async () => {
    const cookie = await signInAs({ name: uniqueName("Ada") });

    expect(await (await readSession(cookie)).json()).toMatchObject({
      user: { provider: "github" },
    });
  });

  test("gives different named identities different sessions", async () => {
    const adaCookie = await signInAs({ name: "Ada Lovelace" });
    const alanCookie = await signInAs({ name: "Alan Turing" });

    expect(adaCookie).not.toBe(alanCookie);
    expect(await (await readSession(adaCookie)).json()).toMatchObject({
      user: { name: "Ada Lovelace", initials: "AL" },
    });
    expect(await (await readSession(alanCookie)).json()).toMatchObject({
      user: { name: "Alan Turing", initials: "AT" },
    });
  });

  test("links a named identity to its seeded account, as a real sign-in does", async () => {
    const name = uniqueName("Returning");
    await seedAccount(env.DB, {
      provider: "google",
      providerAccountId: fakeProviderAccountId(name),
    });

    const cookie = await signInAs({ name, provider: "google" });

    expect(await (await readSession(cookie)).json()).toMatchObject({
      user: { accountExists: true },
    });
  });

  test("links an identity to the account ID the caller names", async () => {
    const seeded = await seedAccount(env.DB, { provider: "microsoft" });

    const cookie = await signInAs({
      name: uniqueName("Named"),
      provider: "microsoft",
      providerAccountId: seeded.providerAccountId,
    });

    expect(await (await readSession(cookie)).json()).toMatchObject({
      user: { accountExists: true },
    });
  });

  test.each([
    ["no name", {}],
    ["an empty name", { name: "" }],
    ["a blank name", { name: "   " }],
  ])(
    "answers a request with %s with a Problem Details 400 and no cookie",
    async (_case, body) => {
      const response = await fakeSignIn(body);

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        errors: [
          { field: "name", message: "Name the identity to sign in as." },
        ],
      });
    },
  );

  test("answers a request with no JSON body with a Problem Details 400", async () => {
    const response = await fakeSignIn("", { "Content-Type": "text/plain" });

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
  });

  test("refuses a name that is an email address, without echoing it", async () => {
    const response = await fakeSignIn({ name: "ada@example.com" });

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({
      errors: [{ field: "name" }],
    });
    expect(body).not.toContain("ada@example.com");
  });

  test("refuses a provider that is not one of the four", async () => {
    const response = await fakeSignIn({ name: "Ada", provider: "bitbucket" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      errors: [{ field: "provider" }],
    });
  });

  test("refuses a sign-in from a foreign origin", async () => {
    const response = await fakeSignIn(
      { name: "Ada" },
      { "Sec-Fetch-Site": "cross-site" },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  test("does not log the email", async () => {
    const logged = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const email = "fake.never-logged@example.com";

    const cookie = await signInAs({ name: uniqueName("Ada"), email });
    await readSession(cookie);
    await fakeSignIn({ email });
    await fakeSignIn({ name: "Ada", email: "not-an-email" });

    for (const spy of logged) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(email);
    }
  });
});

describe("the production entry point", () => {
  test.each([
    ["the exported app", app],
    ["a freshly built production app", createProductionApp()],
  ])(
    "answers the fake provider route with 404 from %s",
    async (_case, built) => {
      const response = await built.request(
        fakePath,
        {
          method: "POST",
          headers: {
            "Sec-Fetch-Site": "same-origin",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Ada Lovelace" }),
        },
        env,
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    },
  );
});
