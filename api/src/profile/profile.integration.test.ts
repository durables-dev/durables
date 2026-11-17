import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import type { Provider } from "../storage/storage";
import {
  seedAccount,
  seedListing,
  seedRemoval,
  seedVersion,
} from "../storage/seed";
import type { RemovalSource } from "../storage/schema";
import type {
  OwnedActivitiesResponse,
  OwnerProfileResponse,
  ProfileResponse,
} from "./responses";

// Reading the owner's profile and activities over HTTP, against the real Worker with real local
// D1 (api/CONVENTIONS.md). Each test seeds its own account and signs in as it through the local
// fake provider, so no test sees another's rows.

const problemContentType = "application/problem+json";

interface FakeIdentity {
  providerAccountId: string;
  provider?: Provider;
  name?: string;
  email?: string;
  username?: string;
}

/** Signs in through the local fake provider and returns the cookie. */
const signIn = async (identity: FakeIdentity): Promise<string> => {
  const response = await exports.default.fetch(
    "http://localhost/api/session/providers/fake",
    {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Ada Lovelace", ...identity }),
    },
  );
  expect(response.status).toBe(204);
  return (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
};

const read = (path: string, cookie?: string) =>
  exports.default.fetch(`http://localhost${path}`, {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });

const readProfile = (cookie?: string) => read("/api/profile", cookie);
const readActivities = (cookie?: string) =>
  read("/api/profile/activities", cookie);
const readSession = (cookie?: string) => read("/api/session", cookie);

/** Writes a listing with versions published at the given dates, and its removal state. */
const seedActivity = async (
  handle: string,
  options: {
    name?: string;
    title?: string;
    versions?: { version: string; publishedAt: Date }[];
    removedBy?: RemovalSource;
  } = {},
): Promise<string> => {
  const name = options.name ?? `activity-${crypto.randomUUID().slice(0, 8)}`;
  await seedListing(env.DB, { handle, name });
  for (const { version, publishedAt } of options.versions ?? [
    { version: "1.0.0", publishedAt: new Date("2026-11-01T00:00:00Z") },
  ]) {
    await seedVersion(env.DB, {
      handle,
      name,
      version,
      title: options.title ?? "Charge card",
      sdk: "Python",
      integrations: ["Stripe"],
      publishedAt,
    });
  }
  if (options.removedBy !== undefined) {
    await seedRemoval(env.DB, { handle, name, removedBy: options.removedBy });
  }
  return name;
};

describe("GET /api/profile", () => {
  test("returns the owner's handle, provider, joined date, listed count and provider details, email included", async () => {
    const account = await seedAccount(env.DB, { provider: "github" });
    await seedActivity(account.handle);
    const cookie = await signIn({
      provider: "github",
      providerAccountId: account.providerAccountId,
      email: "ada@example.com",
      username: "ada-l",
    });

    const response = await readProfile(cookie);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json<OwnerProfileResponse>();
    expect(body).toEqual({
      accountExists: true,
      handle: account.handle,
      provider: "github",
      joinedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
      listedCount: 1,
      providerDetails: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        username: "ada-l",
        avatarUrl: null,
        providerAccountId: account.providerAccountId,
      },
    });
    expect(Date.now() - Date.parse(body.joinedAt)).toBeLessThan(60_000);
  });

  test("answers 401 Problem Details when signed out", async () => {
    const response = await readProfile();

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toContain(problemContentType);
  });

  test("answers a signed-in person with no account as the session read does", async () => {
    const cookie = await signIn({
      providerAccountId: `no-account-${crypto.randomUUID()}`,
      email: "ada@example.com",
    });

    const response = await readProfile(cookie);
    const { user } = await (
      await readSession(cookie)
    ).json<{
      user: { handle: string | null; accountExists: boolean };
    }>();

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(user.accountExists).toBe(false);
    expect(JSON.parse(body)).toEqual({
      accountExists: user.accountExists,
      handle: user.handle,
    });
    expect(body).not.toContain("ada@example.com");
  });

  test("counts only listed activities, leaving out every kind of removal", async () => {
    const account = await seedAccount(env.DB);
    await seedActivity(account.handle);
    await seedActivity(account.handle);
    await seedActivity(account.handle, { removedBy: "publisher" });
    await seedActivity(account.handle, { removedBy: "account-deletion" });
    await seedActivity(account.handle, { removedBy: "durables" });
    const cookie = await signIn({
      providerAccountId: account.providerAccountId,
    });

    const body = await (await readProfile(cookie)).json<ProfileResponse>();

    expect(body).toMatchObject({ listedCount: 2 });
  });

  test("counts zero for an owner with no listed activities", async () => {
    const account = await seedAccount(env.DB);
    const cookie = await signIn({
      providerAccountId: account.providerAccountId,
    });

    expect(await (await readProfile(cookie)).json()).toMatchObject({
      listedCount: 0,
    });
  });

  test.each<Provider>(["google", "microsoft"])(
    "returns no provider username for a %s account",
    async (provider) => {
      const account = await seedAccount(env.DB, { provider });
      const cookie = await signIn({
        provider,
        providerAccountId: account.providerAccountId,
        username: "should-not-show",
      });

      const body = await (
        await readProfile(cookie)
      ).json<OwnerProfileResponse>();

      expect(body.provider).toBe(provider);
      expect(body.providerDetails.username).toBeNull();
    },
  );
});

describe("GET /api/session alongside the profile", () => {
  test("still never contains the email", async () => {
    const account = await seedAccount(env.DB);
    const cookie = await signIn({
      providerAccountId: account.providerAccountId,
      email: "ada@example.com",
    });

    expect(await (await readProfile(cookie)).text()).toContain(
      "ada@example.com",
    );
    const session = await readSession(cookie);
    expect(session.status).toBe(200);
    const body = await session.text();
    expect(body).not.toContain("ada@example.com");
    expect(body).not.toContain("email");
  });
});

describe("GET /api/profile/activities", () => {
  test("lists a listed and a removed activity with their status, newest published first", async () => {
    const account = await seedAccount(env.DB);
    const older = await seedActivity(account.handle, {
      title: "Send receipt",
      versions: [
        { version: "1.0.0", publishedAt: new Date("2026-09-01T00:00:00Z") },
      ],
    });
    const newer = await seedActivity(account.handle, {
      title: "Refund charge",
      versions: [
        { version: "1.0.0", publishedAt: new Date("2026-10-01T00:00:00Z") },
      ],
      removedBy: "publisher",
    });
    const cookie = await signIn({
      providerAccountId: account.providerAccountId,
    });

    const response = await readActivities(cookie);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { activities } = await response.json<OwnedActivitiesResponse>();
    expect(activities).toEqual([
      {
        handle: account.handle,
        name: newer,
        version: "1.0.0",
        address: `${account.handle}/${newer}@1.0.0`,
        title: "Refund charge",
        sdk: "Python",
        versionCount: 1,
        latestPublishedAt: "2026-10-01T00:00:00.000Z",
        status: "removed",
      },
      {
        handle: account.handle,
        name: older,
        version: "1.0.0",
        address: `${account.handle}/${older}@1.0.0`,
        title: "Send receipt",
        sdk: "Python",
        versionCount: 1,
        latestPublishedAt: "2026-09-01T00:00:00.000Z",
        status: "listed",
      },
    ]);
  });

  test("shows each activity at its latest version, with its version count, ordered by that version's date", async () => {
    const account = await seedAccount(env.DB);
    // First published earliest, but its latest version is the newest of all.
    const updated = await seedActivity(account.handle, {
      versions: [
        { version: "1.0.0", publishedAt: new Date("2026-08-01T00:00:00Z") },
        { version: "1.9.0", publishedAt: new Date("2026-09-01T00:00:00Z") },
        { version: "1.10.0", publishedAt: new Date("2026-11-03T00:00:00Z") },
      ],
    });
    const middle = await seedActivity(account.handle, {
      versions: [
        { version: "1.0.0", publishedAt: new Date("2026-10-15T00:00:00Z") },
      ],
    });
    const cookie = await signIn({
      providerAccountId: account.providerAccountId,
    });

    const { activities } = await (
      await readActivities(cookie)
    ).json<OwnedActivitiesResponse>();

    expect(
      activities.map(({ name, version, versionCount, latestPublishedAt }) => ({
        name,
        version,
        versionCount,
        latestPublishedAt,
      })),
    ).toEqual([
      {
        name: updated,
        version: "1.10.0",
        versionCount: 3,
        latestPublishedAt: "2026-11-03T00:00:00.000Z",
      },
      {
        name: middle,
        version: "1.0.0",
        versionCount: 1,
        latestPublishedAt: "2026-10-15T00:00:00.000Z",
      },
    ]);
  });

  test("includes activities removed by account deletion and by Durables as removed", async () => {
    const account = await seedAccount(env.DB);
    await seedActivity(account.handle, { removedBy: "account-deletion" });
    await seedActivity(account.handle, { removedBy: "durables" });
    const cookie = await signIn({
      providerAccountId: account.providerAccountId,
    });

    const { activities } = await (
      await readActivities(cookie)
    ).json<OwnedActivitiesResponse>();

    expect(activities.map(({ status }) => status)).toEqual([
      "removed",
      "removed",
    ]);
  });

  test("answers an empty list for an owner with no activities", async () => {
    const account = await seedAccount(env.DB);
    const cookie = await signIn({
      providerAccountId: account.providerAccountId,
    });

    const response = await readActivities(cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activities: [] });
  });

  test("never includes another account's activities", async () => {
    const owner = await seedAccount(env.DB);
    const other = await seedAccount(env.DB);
    const mine = await seedActivity(owner.handle);
    await seedActivity(other.handle);
    await seedActivity(other.handle, { removedBy: "publisher" });
    const cookie = await signIn({
      providerAccountId: owner.providerAccountId,
    });

    const { activities } = await (
      await readActivities(cookie)
    ).json<OwnedActivitiesResponse>();

    expect(activities.map(({ handle, name }) => ({ handle, name }))).toEqual([
      { handle: owner.handle, name: mine },
    ]);
  });

  test("answers an empty list for a signed-in person with no account", async () => {
    const cookie = await signIn({
      providerAccountId: `no-account-${crypto.randomUUID()}`,
    });

    const response = await readActivities(cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activities: [] });
  });

  test("answers 401 Problem Details when signed out", async () => {
    const response = await readActivities();

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toContain(problemContentType);
  });
});
