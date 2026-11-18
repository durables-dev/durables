import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, test, vi } from "vitest";
import { listings, providerAccounts } from "../storage/schema";
import {
  readAllRows,
  seedAccount,
  seedListing,
  seedRemoval,
  seedVersion,
} from "../storage/seed";
import { Storage } from "../storage/storage";
import type { SessionResponse } from "./session";

// Signing in with a provider account whose account is pending deletion, then choosing Restore
// or Start as a new user (ADR 0015), over HTTP against the real Worker with real local D1. The
// sign-in goes through the local fake provider, which holds a pending account's sign-in the
// same way the provider callback does. Each test seeds its own account.

const problemContentType = "application/problem+json";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

afterEach(() => {
  vi.useRealTimers();
});

/** The name=value pair of the cookie with this name, if the response sets one. */
const cookieNamed = (response: Response, name: string): string | undefined =>
  response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0] ?? "")
    .find((pair) => pair.startsWith(`${name}=`) && pair !== `${name}=`);

/** The Set-Cookie header that clears the cookie with this name, if the response sends one. */
const clearedCookie = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((header) => header.startsWith(`${name}=;`));

const fakeSignIn = (providerAccountId: string, cookie?: string) =>
  exports.default.fetch("http://localhost/api/session/providers/fake", {
    method: "POST",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify({ name: "Ada Lovelace", providerAccountId }),
  });

const post = (path: string, cookie?: string) =>
  exports.default.fetch(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
  });

const readSession = async (cookie?: string) =>
  (
    await exports.default.fetch("http://localhost/api/session", {
      headers: cookie === undefined ? {} : { Cookie: cookie },
    })
  ).json<SessionResponse>();

/** Adds a listing with one version under a handle. */
const addListing = async (handle: string, name: string) => {
  await seedListing(env.DB, { handle, name });
  await seedVersion(env.DB, {
    handle,
    name,
    version: "1.0.0",
    title: "Charge card",
    sdk: "Python",
    integrations: [],
  });
};

/** Who removed each of a handle's listings, by name. */
const removalsOf = async (handle: string) =>
  Object.fromEntries(
    (
      await drizzle(env.DB)
        .select({ name: listings.name, removedBy: listings.removedBy })
        .from(listings)
        .where(eq(listings.handle, handle))
    ).map(({ name, removedBy }) => [name, removedBy]),
  );

/**
 * An account with one listed activity and one its publisher removed, which the owner then
 * deleted. Returns the account and the time deletion was asked for.
 */
const deletedAccount = async () => {
  const account = await seedAccount(env.DB);
  await addListing(account.handle, "charge-card");
  await addListing(account.handle, "old-card");
  await seedRemoval(env.DB, {
    handle: account.handle,
    name: "old-card",
    removedBy: "publisher",
  });
  const deletedAt = await storage().requestAccountDeletion(account.accountId);
  if (deletedAt === undefined) {
    throw new Error("Expected the account to be deleted.");
  }
  return { ...account, deletedAt };
};

/** Signs a deleted account in again, and returns the cookie that holds the sign-in. */
const signInAgain = async (providerAccountId: string) => {
  const response = await fakeSignIn(providerAccountId);
  expect(response.status).toBe(204);
  const held = cookieNamed(response, "__Host-pending-sign-in");
  expect(held).toBeDefined();
  return held ?? "";
};

const expectProblem = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toBe(problemContentType);
  expect(await response.json()).toMatchObject({ status });
};

describe("signing in with a pending account", () => {
  test("starts no session and holds the sign-in for the Restore choice", async () => {
    const account = await deletedAccount();

    const response = await fakeSignIn(account.providerAccountId);

    expect(response.status).toBe(204);
    expect(cookieNamed(response, "__Host-session")).toBeUndefined();
    expect(cookieNamed(response, "__Host-pending-sign-in")).toBeDefined();
  });

  test("ends a session the browser already had", async () => {
    const account = await deletedAccount();
    const other = await fakeSignIn(`other-${crypto.randomUUID()}`);
    const session = cookieNamed(other, "__Host-session");

    const response = await fakeSignIn(account.providerAccountId, session);

    expect(clearedCookie(response, "__Host-session")).toContain("Max-Age=0");
  });

  test("the session read offers only the Restore choice, naming the handle and the final date", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);

    const session = await readSession(held);

    expect(session).toEqual({
      user: null,
      restore: {
        handle: account.handle,
        finalAt: new Date(
          account.deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    });
  });

  test("the held sign-in cannot publish, change or delete anything", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    const rowsBefore = await readAllRows(env.DB);

    for (const [method, path, body] of [
      ["POST", "/api/activities", {}],
      [
        "PATCH",
        `/api/activities/${account.handle}/charge-card`,
        { version: "1.0.0", description: "Changed while pending." },
      ],
      ["POST", "/api/checks", { code: "x" }],
      ["DELETE", "/api/account", { handle: account.handle }],
      ["PUT", "/api/session/handle", { handle: "anything-new" }],
    ] as const) {
      const response = await exports.default.fetch(`http://localhost${path}`, {
        method,
        headers: {
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
          Cookie: held,
        },
        body: JSON.stringify(body),
      });
      expect({ method, path, status: response.status }).toEqual({
        method,
        path,
        status: 401,
      });
    }
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("the hold ends after an hour, and then nothing is offered", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1000);

    expect(await readSession(held)).toEqual({ user: null });
    await expectProblem(await post("/api/session/restore", held), 401);
  });

  test("an account restored since the sign-in offers nothing", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    await storage().restoreAccount(account.accountId);

    expect(await readSession(held)).toEqual({ user: null });
  });

  test("a deletion that is already final finds no account, and signs in as someone new", async () => {
    const account = await deletedAccount();
    await storage().finalizeAccountDeletion(account.accountId);

    const response = await fakeSignIn(account.providerAccountId);

    expect(cookieNamed(response, "__Host-pending-sign-in")).toBeUndefined();
    const session = cookieNamed(response, "__Host-session");
    expect(await readSession(session)).toMatchObject({
      user: { handle: null, accountExists: false },
    });
  });
});

describe("POST /api/session/restore", () => {
  test("returns only the activities account deletion removed, and clears the pending mark", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);

    const response = await post("/api/session/restore", held);

    expect(response.status).toBe(200);
    expect(await removalsOf(account.handle)).toEqual({
      "charge-card": null,
      "old-card": "publisher",
    });
    expect(
      (await storage().findAccountState(account))?.deletionRequestedAt,
    ).toBeNull();
  });

  test("starts the session for the restored account and releases the hold", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);

    const response = await post("/api/session/restore", held);

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json<SessionResponse>()).toEqual({
      user: {
        name: "Ada Lovelace",
        initials: "AL",
        provider: "github",
        handle: account.handle,
        accountExists: true,
      },
    });
    expect(clearedCookie(response, "__Host-pending-sign-in")).toContain(
      "Max-Age=0",
    );
    const session = cookieNamed(response, "__Host-session");
    expect(await readSession(session)).toMatchObject({
      user: { handle: account.handle, accountExists: true },
    });
  });

  test("the restored session can change the account's activities again", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    const session = cookieNamed(
      await post("/api/session/restore", held),
      "__Host-session",
    );

    const response = await exports.default.fetch(
      `http://localhost/api/activities/${account.handle}/charge-card`,
      {
        method: "PATCH",
        headers: {
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
          Cookie: session ?? "",
        },
        body: JSON.stringify({
          version: "1.0.0",
          description: "Changed after restoring.",
        }),
      },
    );

    expect(response.status).toBe(200);
  });

  test("answers 401 when no sign-in is held", async () => {
    await expectProblem(await post("/api/session/restore"), 401);
  });

  test("answers 401 to a signed-in session with no held sign-in", async () => {
    const response = await fakeSignIn(`someone-${crypto.randomUUID()}`);
    const session = cookieNamed(response, "__Host-session");

    await expectProblem(await post("/api/session/restore", session), 401);
  });

  test("answers 409 for an account that is not pending, and changes nothing", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    await storage().restoreAccount(account.accountId);
    const rowsBefore = await readAllRows(env.DB);

    await expectProblem(await post("/api/session/restore", held), 409);
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("answers 409 when the deletion became final after the sign-in, and changes nothing", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    await storage().finalizeAccountDeletion(account.accountId);
    const rowsBefore = await readAllRows(env.DB);

    await expectProblem(await post("/api/session/restore", held), 409);
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("answers 403 to a request from another site", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);

    const response = await exports.default.fetch(
      "http://localhost/api/session/restore",
      {
        method: "POST",
        headers: { "Sec-Fetch-Site": "cross-site", Cookie: held },
      },
    );

    expect(response.status).toBe(403);
    expect(
      (await storage().findAccountState(account))?.deletionRequestedAt,
    ).toBeInstanceOf(Date);
  });
});

describe("POST /api/session/start-over", () => {
  test("deletes the provider links, retires the handle and starts a session with no account", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);

    const response = await post("/api/session/start-over", held);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json<SessionResponse>()).toEqual({
      user: {
        name: "Ada Lovelace",
        initials: "AL",
        provider: "github",
        handle: null,
        accountExists: false,
      },
    });
    expect(
      await drizzle(env.DB)
        .select()
        .from(providerAccounts)
        .where(eq(providerAccounts.accountId, account.accountId)),
    ).toEqual([]);
    expect(await storage().isHandleAvailable(account.handle)).toBe(false);
    expect(clearedCookie(response, "__Host-pending-sign-in")).toContain(
      "Max-Age=0",
    );
    const session = cookieNamed(response, "__Host-session");
    expect(await readSession(session)).toMatchObject({
      user: { handle: null, accountExists: false },
    });
  });

  test("the new session cannot choose the retired handle", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    const session = cookieNamed(
      await post("/api/session/start-over", held),
      "__Host-session",
    );

    const response = await exports.default.fetch(
      "http://localhost/api/session/handle",
      {
        method: "PUT",
        headers: {
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
          Cookie: session ?? "",
        },
        body: JSON.stringify({ handle: account.handle }),
      },
    );

    await expectProblem(response, 409);
  });

  test("deletes nothing published", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    const rowsBefore = await readAllRows(env.DB);

    await post("/api/session/start-over", held);

    const rowsAfter = await readAllRows(env.DB);
    for (const table of ["accounts", "handles", "listings", "versions"]) {
      expect(rowsAfter[table]).toEqual(rowsBefore[table]);
    }
  });

  test("signing in again afterwards finds no account", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    await post("/api/session/start-over", held);

    const response = await fakeSignIn(account.providerAccountId);

    expect(cookieNamed(response, "__Host-pending-sign-in")).toBeUndefined();
    expect(
      await readSession(cookieNamed(response, "__Host-session")),
    ).toMatchObject({ user: { accountExists: false } });
  });

  test("answers 401 when no sign-in is held", async () => {
    await expectProblem(await post("/api/session/start-over"), 401);
  });

  test("answers 409 for an account that is not pending, and changes nothing", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    await storage().restoreAccount(account.accountId);
    const rowsBefore = await readAllRows(env.DB);

    await expectProblem(await post("/api/session/start-over", held), 409);
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });

  test("answers 409 the second time, and changes nothing", async () => {
    const account = await deletedAccount();
    const held = await signInAgain(account.providerAccountId);
    await post("/api/session/start-over", held);
    const rowsBefore = await readAllRows(env.DB);

    await expectProblem(await post("/api/session/start-over", held), 409);
    expect(await readAllRows(env.DB)).toEqual(rowsBefore);
  });
});
