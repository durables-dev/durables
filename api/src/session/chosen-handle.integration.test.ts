import { reservedHandles } from "@durables/schemas";
import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { readAllRows, seedAccount, seedRetiredHandle } from "../storage/seed";
import type { Provider } from "../storage/storage";
import type { SessionResponse } from "./session";

const problemContentType = "application/problem+json";

/** A handle no other test uses, so seeded rows never collide. */
const uniqueHandle = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

/**
 * Signs in through the local fake provider, which the Worker under test mounts, and returns
 * the cookie to send back.
 */
const signIn = async (
  identity: { provider?: Provider; providerAccountId?: string } = {},
): Promise<string> => {
  const response = await exports.default.fetch(
    "http://localhost/api/session/providers/fake",
    {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ada Lovelace",
        providerAccountId: `fake-${crypto.randomUUID()}`,
        ...identity,
      }),
    },
  );
  expect(response.status).toBe(204);
  return cookieFrom(response);
};

/** The name=value part of a Set-Cookie header, ready to send back as a Cookie header. */
const cookieFrom = (response: Response): string =>
  (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";

const saveHandle = (body: unknown, cookie?: string) =>
  exports.default.fetch("http://localhost/api/session/handle", {
    method: "PUT",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify(body),
  });

const readHandle = async (cookie: string): Promise<string | null> => {
  const response = await exports.default.fetch("http://localhost/api/session", {
    headers: { Cookie: cookie },
  });
  const { user } = await response.json<SessionResponse>();
  if (user === null) {
    throw new Error("Expected a signed-in session");
  }
  return user.handle;
};

/** Saves a handle that must succeed, and returns the reissued cookie. */
const saveAvailable = async (
  handle: string,
  cookie: string,
): Promise<string> => {
  const response = await saveHandle({ handle }, cookie);
  expect(response.status).toBe(200);
  return cookieFrom(response);
};

/** Asserts a refused save left the session alone: no cookie issued, the handle unchanged. */
const expectSessionUnchanged = async (
  response: Response,
  cookie: string,
  handle: string | null,
) => {
  expect(response.headers.get("Set-Cookie")).toBeNull();
  expect(await readHandle(cookie)).toBe(handle);
};

describe("PUT /api/session/handle", () => {
  test("saves an available handle, and the session read returns it", async () => {
    const cookie = await signIn({ provider: "google" });
    const handle = uniqueHandle("chosen");

    const response = await saveHandle({ handle }, cookie);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      user: {
        name: "Ada Lovelace",
        initials: "AL",
        provider: "google",
        handle,
        accountExists: false,
      },
    });
    const reissued = cookieFrom(response);
    expect(reissued).toMatch(/^__Host-session=/);
    expect(await readHandle(reissued)).toBe(handle);
  });

  test.each([
    ["an empty handle", "", "Choose a handle."],
    [
      "2 characters",
      "ab",
      "Use 3 to 39 lowercase letters, numbers and single hyphens.",
    ],
    [
      "40 characters",
      "a".repeat(40),
      "Use 3 to 39 lowercase letters, numbers and single hyphens.",
    ],
    [
      "an uppercase letter",
      "Ddieruf",
      "Use 3 to 39 lowercase letters, numbers and single hyphens.",
    ],
    [
      "two hyphens in a row",
      "dan--dieruf",
      "Use 3 to 39 lowercase letters, numbers and single hyphens.",
    ],
    [
      "a trailing hyphen",
      "ddieruf-",
      "Use 3 to 39 lowercase letters, numbers and single hyphens.",
    ],
  ])(
    "refuses %s with a 400 and field errors, leaving the session unchanged",
    async (_case, handle, message) => {
      const cookie = await saveAvailable(
        uniqueHandle("before"),
        await signIn(),
      );
      const before = await readHandle(cookie);

      const response = await saveHandle({ handle }, cookie);

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(await response.json()).toMatchObject({
        status: 400,
        errors: [{ field: "handle", message }],
      });
      await expectSessionUnchanged(response, cookie, before);
    },
  );

  test("refuses a body with no handle with a 400 and field errors", async () => {
    const cookie = await signIn();

    const response = await saveHandle({}, cookie);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      status: 400,
      errors: [{ field: "handle" }],
    });
    await expectSessionUnchanged(response, cookie, null);
  });

  test("refuses a used handle with a 409, leaving the session unchanged", async () => {
    const { handle } = await seedAccount(env.DB, {
      handle: uniqueHandle("used"),
    });
    const cookie = await signIn();

    const response = await saveHandle({ handle }, cookie);

    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(await response.json()).toMatchObject({
      status: 409,
      detail: `${handle} is taken.`,
      errors: [{ field: "handle", message: `${handle} is taken.` }],
    });
    await expectSessionUnchanged(response, cookie, null);
  });

  test("refuses a retired handle with a 409, leaving the session unchanged", async () => {
    const handle = uniqueHandle("retired");
    await seedRetiredHandle(env.DB, handle);
    const cookie = await signIn();

    const response = await saveHandle({ handle }, cookie);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      detail: `${handle} is taken.`,
    });
    await expectSessionUnchanged(response, cookie, null);
  });

  test.each([...reservedHandles])(
    "refuses the reserved word %s with a 409",
    async (word) => {
      const cookie = await signIn();

      const response = await saveHandle({ handle: word }, cookie);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        detail: `${word} is taken.`,
      });
      await expectSessionUnchanged(response, cookie, null);
    },
  );

  test("answers 401 Problem Details for an anonymous caller", async () => {
    const response = await saveHandle({ handle: uniqueHandle("anon") });

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(await response.json()).toMatchObject({ status: 401 });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  test("answers 401, not 400, for an anonymous caller with a bad handle", async () => {
    const response = await saveHandle({ handle: "AB" });

    expect(response.status).toBe(401);
  });

  test("answers 401 for a cookie with an invalid signature", async () => {
    const cookie = await signIn();

    const response = await saveHandle(
      { handle: uniqueHandle("forged") },
      `${cookie}x`,
    );

    expect(response.status).toBe(401);
  });

  test("replaces the first choice when the publisher saves again", async () => {
    const first = uniqueHandle("first");
    const second = uniqueHandle("second");
    const afterFirst = await saveAvailable(first, await signIn());

    const afterSecond = await saveAvailable(second, afterFirst);

    expect(await readHandle(afterSecond)).toBe(second);
  });

  test("refuses a publisher who already has an account with a 409", async () => {
    const seeded = await seedAccount(env.DB, {
      provider: "github",
      handle: uniqueHandle("owner"),
    });
    const cookie = await signIn({
      provider: "github",
      providerAccountId: seeded.providerAccountId,
    });

    const response = await saveHandle({ handle: uniqueHandle("new") }, cookie);

    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    // The session read returns the account's handle once the account exists (DUR-73).
    await expectSessionUnchanged(response, cookie, seeded.handle);
  });

  test("does not write to the account or handle tables", async () => {
    const handle = uniqueHandle("unreserved");
    const providerAccountId = `fake-${crypto.randomUUID()}`;
    const cookie = await signIn({ providerAccountId });
    const before = await readAllRows(env.DB);

    await saveAvailable(handle, cookie);

    const after = await readAllRows(env.DB);
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain(handle);
    expect(JSON.stringify(after)).not.toContain(providerAccountId);
  });

  test("is refused from another origin", async () => {
    const cookie = await signIn();

    const response = await exports.default.fetch(
      "http://localhost/api/session/handle",
      {
        method: "PUT",
        headers: {
          "Sec-Fetch-Site": "cross-site",
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ handle: uniqueHandle("cross") }),
      },
    );

    expect(response.status).toBe(403);
    await expectSessionUnchanged(response, cookie, null);
  });
});
