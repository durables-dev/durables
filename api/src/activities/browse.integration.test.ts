import type { Sdk } from "@durables/schemas";
import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { seedAccount, seedListing, seedVersion } from "../storage/seed";
import {
  BROWSE_BATCH_SIZE,
  cursorMessage,
  sdkFilterMessage,
} from "./browse-request";
import type { ActivityCard, BrowseResponse } from "./responses";

// Browsing published activities over HTTP, against real local D1. Rows written by one test stay
// for the next, so each test narrows to a publisher no other test uses, except the one that reads
// every activity, whose listings are dated after anything else here.

const problemContentType = "application/problem+json";

interface SeededVersion {
  version?: string;
  title?: string;
  sdk?: Sdk;
  integrations?: string[];
  publishedAt?: Date;
}

/** A handle that exists, which no other test uses. */
const newHandle = async () => (await seedAccount(env.DB)).handle;

/**
 * Writes a listing and its versions, each defaulting to 1.0.0, Python, Stripe and now. The
 * published date is stored in whole seconds, so dates here are whole seconds too.
 */
const seedActivity = async (
  handle: string,
  listing: { name?: string; description?: string } = {},
  versionRows: SeededVersion[] = [{}],
): Promise<{ handle: string; name: string }> => {
  const name = listing.name ?? `activity-${crypto.randomUUID().slice(0, 8)}`;
  await seedListing(env.DB, {
    handle,
    name,
    description: listing.description ?? "Charges a card through Stripe.",
  });
  for (const row of versionRows) {
    await seedVersion(env.DB, {
      handle,
      name,
      version: row.version ?? "1.0.0",
      title: row.title ?? "Charge card",
      sdk: row.sdk ?? "Python",
      integrations: row.integrations ?? ["Stripe"],
      ...(row.publishedAt === undefined
        ? {}
        : { publishedAt: row.publishedAt }),
    });
  }
  return { handle, name };
};

const at = (iso: string) => new Date(iso);

type Query = Record<string, string | string[]>;

const browsePath = (query: Query = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const each of Array.isArray(value) ? value : [value]) {
      params.append(key, each);
    }
  }
  const search = params.toString();
  return search === "" ? "/api/activities" : `/api/activities?${search}`;
};

const get = (query?: Query) =>
  exports.default.fetch(`http://localhost${browsePath(query)}`);

const browse = async (query?: Query): Promise<BrowseResponse> => {
  const response = await get(query);
  expect(response.status).toBe(200);
  return response.json<BrowseResponse>();
};

const names = (body: BrowseResponse) =>
  body.activities.map((card) => card.name);

/** Newest first, then by handle and name. */
const inBrowseOrder = (a: ActivityCard, b: ActivityCard) =>
  b.publishedAt.localeCompare(a.publishedAt) ||
  a.handle.localeCompare(b.handle) ||
  a.name.localeCompare(b.name);

const expectInvalid = async (query: Query, field: string, message: string) => {
  const response = await get(query);
  expect(response.status).toBe(400);
  expect(response.headers.get("Content-Type")).toBe(problemContentType);
  expect(await response.json()).toMatchObject({
    status: 400,
    errors: [{ field, message }],
  });
};

describe("browsing with no filters", () => {
  test("answers the first 50 newest first, with the count of every match and the sort newest", async () => {
    const before = await browse();
    const handle = await newHandle();
    const oldest = await seedActivity(handle, {}, [
      { publishedAt: at("2099-01-01T00:00:00Z") },
    ]);
    const newest = await seedActivity(handle, {}, [
      { publishedAt: at("2099-01-03T00:00:00Z") },
    ]);
    const middle = await seedActivity(handle, {}, [
      { publishedAt: at("2099-01-02T00:00:00Z") },
    ]);

    const body = await browse();

    expect(body.sort).toBe("newest");
    expect(body.count).toBe(before.count + 3);
    expect(body.activities.length).toBe(
      Math.min(body.count, BROWSE_BATCH_SIZE),
    );
    expect(names(body).slice(0, 3)).toEqual([
      newest.name,
      middle.name,
      oldest.name,
    ]);
    expect(body.activities).toEqual([...body.activities].sort(inBrowseOrder));
  });

  test("answers no-store", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("answers every request, however many come from one address in a minute", async () => {
    // More requests than either rate limit allows in its period (wrangler.toml).
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await get()).status);
    }

    expect(statuses.every((status) => status === 200)).toBe(true);
  });
});

describe("each card", () => {
  test("holds the title, address, SDK, current description, integrations, publisher and published date", async () => {
    const handle = await newHandle();
    const { name } = await seedActivity(
      handle,
      { description: "Uploads a file to a bucket." },
      [
        {
          title: "Upload file",
          sdk: "TypeScript",
          integrations: ["Amazon S3", "Postgres"],
          publishedAt: at("2026-10-20T09:30:00Z"),
        },
      ],
    );

    const body = await browse({ publisher: handle });

    expect(body.activities).toEqual([
      {
        address: `${handle}/${name}@1.0.0`,
        handle,
        name,
        version: "1.0.0",
        title: "Upload file",
        sdk: "TypeScript",
        description: "Uploads a file to a bucket.",
        integrations: ["Amazon S3", "Postgres"],
        publishedAt: "2026-10-20T09:30:00.000Z",
      },
    ]);
  });

  test("answers an empty integrations list when the version has none", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [{ integrations: [] }]);

    const body = await browse({ publisher: handle });

    expect(body.activities.map((card) => card.integrations)).toEqual([[]]);
  });
});

describe("a listing with several versions", () => {
  test("appears once, at its highest version number, even when an older line was published later", async () => {
    const handle = await newHandle();
    const { name } = await seedActivity(handle, {}, [
      {
        version: "1.0.0",
        title: "Old",
        publishedAt: at("2026-01-01T00:00:00Z"),
      },
      {
        version: "2.0.0",
        title: "Newest number",
        publishedAt: at("2026-02-01T00:00:00Z"),
      },
      {
        version: "1.1.0",
        title: "Older line",
        publishedAt: at("2026-03-01T00:00:00Z"),
      },
    ]);

    const body = await browse({ publisher: handle });

    expect(body.count).toBe(1);
    expect(body.activities).toMatchObject([
      {
        name,
        version: "2.0.0",
        address: `${handle}/${name}@2.0.0`,
        title: "Newest number",
      },
    ]);
  });

  test("shows the published date of the version on the card", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [
      { version: "1.0.0", publishedAt: at("2026-01-01T00:00:00Z") },
      { version: "1.1.0", publishedAt: at("2026-02-01T00:00:00Z") },
    ]);

    const body = await browse({ publisher: handle });

    expect(body.activities).toMatchObject([
      { version: "1.1.0", publishedAt: "2026-02-01T00:00:00.000Z" },
    ]);
  });

  test("compares each part of the version as a number", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [
      { version: "1.9.0" },
      { version: "1.10.0" },
      { version: "1.2.10" },
    ]);

    const body = await browse({ publisher: handle });

    expect(body.activities.map((card) => card.version)).toEqual(["1.10.0"]);
  });

  test("is filtered by the version on the card, not by older versions", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [
      { version: "1.0.0", sdk: "Python", integrations: ["Stripe"] },
      { version: "2.0.0", sdk: "TypeScript", integrations: ["Slack"] },
    ]);

    const stripe = await browse({ publisher: handle, integration: "Stripe" });
    const python = await browse({ publisher: handle, sdk: "Python" });
    const slack = await browse({ publisher: handle, integration: "Slack" });

    expect(stripe.count).toBe(0);
    expect(python.count).toBe(0);
    expect(slack.activities.map((card) => card.version)).toEqual(["2.0.0"]);
  });

  test("is ordered by the published date of the version on the card", async () => {
    const handle = await newHandle();
    const refreshed = await seedActivity(handle, {}, [
      { version: "1.0.0", publishedAt: at("2026-01-01T00:00:00Z") },
      { version: "2.0.0", publishedAt: at("2026-03-01T00:00:00Z") },
    ]);
    const between = await seedActivity(handle, {}, [
      { publishedAt: at("2026-02-01T00:00:00Z") },
    ]);

    const body = await browse({ publisher: handle });

    expect(names(body)).toEqual([refreshed.name, between.name]);
  });
});

describe("the SDK filter", () => {
  test("with several SDKs, matches a listing in any one of them", async () => {
    const handle = await newHandle();
    const python = await seedActivity(handle, {}, [
      { sdk: "Python", publishedAt: at("2026-01-03T00:00:00Z") },
    ]);
    const dotnet = await seedActivity(handle, {}, [
      { sdk: ".NET", publishedAt: at("2026-01-02T00:00:00Z") },
    ]);
    await seedActivity(handle, {}, [{ sdk: "TypeScript" }]);

    const body = await browse({ publisher: handle, sdk: ["Python", ".NET"] });

    expect(names(body)).toEqual([python.name, dotnet.name]);
    expect(body.count).toBe(2);
  });

  test("combines with the integration filter, so only listings matching both return", async () => {
    const handle = await newHandle();
    const both = await seedActivity(handle, {}, [
      { sdk: "Python", integrations: ["Stripe", "Postgres"] },
    ]);
    await seedActivity(handle, {}, [
      { sdk: "Python", integrations: ["Slack"] },
    ]);
    await seedActivity(handle, {}, [
      { sdk: "TypeScript", integrations: ["Stripe"] },
    ]);
    await seedActivity(handle, {}, [{ sdk: "Python", integrations: [] }]);

    const body = await browse({
      publisher: handle,
      sdk: "Python",
      integration: "Stripe",
    });

    expect(names(body)).toEqual([both.name]);
    expect(body.count).toBe(1);
  });

  test.each(["Java", "python", ""])(
    "answers 400 for the unsupported SDK %j",
    async (sdk) => {
      await expectInvalid({ sdk }, "sdk", sdkFilterMessage);
    },
  );

  test("answers 400 when one of several SDKs is unsupported", async () => {
    await expectInvalid({ sdk: ["Python", "Java"] }, "sdk", sdkFilterMessage);
  });
});

describe("the integration filter", () => {
  test("with several integrations, matches a listing with any one of them", async () => {
    const handle = await newHandle();
    const stripe = await seedActivity(handle, {}, [
      { integrations: ["Stripe"], publishedAt: at("2026-01-03T00:00:00Z") },
    ]);
    const slack = await seedActivity(handle, {}, [
      {
        integrations: ["Postgres", "Slack"],
        publishedAt: at("2026-01-02T00:00:00Z"),
      },
    ]);
    await seedActivity(handle, {}, [{ integrations: ["Amazon S3"] }]);

    const body = await browse({
      publisher: handle,
      integration: ["Stripe", "Slack"],
    });

    expect(names(body)).toEqual([stripe.name, slack.name]);
    expect(body.count).toBe(2);
  });

  test("excludes a listing with no integrations, which shows without the filter", async () => {
    const handle = await newHandle();
    const none = await seedActivity(handle, {}, [{ integrations: [] }]);

    const filtered = await browse({ publisher: handle, integration: "Stripe" });
    const unfiltered = await browse({ publisher: handle });

    expect(filtered.count).toBe(0);
    expect(names(unfiltered)).toEqual([none.name]);
  });

  test("matches whole integration names inside the stored list, not part of one", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [{ integrations: ["Amazon S3"] }]);

    const body = await browse({ publisher: handle, integration: "S3" });

    expect(body.count).toBe(0);
  });
});

describe("the publisher filter", () => {
  test("answers only that publisher's listings, not text that mentions the handle", async () => {
    const handle = await newHandle();
    const other = await newHandle();
    const own = await seedActivity(handle);
    await seedActivity(
      other,
      {
        name: `${handle}-tools`,
        description: `Ported from ${handle}'s activity.`,
      },
      [{ title: `Charge card like ${handle}` }],
    );

    const body = await browse({ publisher: handle });

    expect(body.activities.map((card) => [card.handle, card.name])).toEqual([
      [handle, own.name],
    ]);
    expect(body.count).toBe(1);
  });

  test("answers 400 for an empty publisher", async () => {
    const response = await get({ publisher: "" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      errors: [{ field: "publisher" }],
    });
  });
});

describe("batches", () => {
  test("pages 120 matches as 50, 50 and 20, each with the full count, and the last with no next position", async () => {
    const handle = await newHandle();
    const seeded: string[] = [];
    for (let i = 0; i < 120; i++) {
      // Pairs share a published second, so the order within a second is exercised too.
      const { name } = await seedActivity(
        handle,
        { name: `activity-${String(i).padStart(3, "0")}` },
        [
          {
            publishedAt: new Date(
              Date.UTC(2026, 0, 1) + Math.floor(i / 2) * 1000,
            ),
          },
        ],
      );
      seeded.push(name);
    }
    const expected = [...seeded].sort((a, b) => {
      const second = (n: string) => Math.floor(Number(n.slice(-3)) / 2);
      return second(b) - second(a) || a.localeCompare(b);
    });

    const first = await browse({ publisher: handle });
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await browse({
      publisher: handle,
      cursor: first.nextCursor ?? "",
    });
    expect(second.nextCursor).toEqual(expect.any(String));
    const third = await browse({
      publisher: handle,
      cursor: second.nextCursor ?? "",
    });

    expect([first, second, third].map((b) => b.activities.length)).toEqual([
      50, 50, 20,
    ]);
    expect([first, second, third].map((b) => b.count)).toEqual([120, 120, 120]);
    expect(third.nextCursor).toBeNull();
    expect([...names(first), ...names(second), ...names(third)]).toEqual(
      expected,
    );
  });

  test("answers exactly 50 matches in one batch with no next position", async () => {
    const handle = await newHandle();
    for (let i = 0; i < 50; i++) {
      await seedActivity(handle);
    }

    const body = await browse({ publisher: handle });

    expect(body.activities.length).toBe(50);
    expect(body.count).toBe(50);
    expect(body.nextCursor).toBeNull();
  });

  test.each([
    ["not base64url", "not a cursor!"],
    ["base64url that is not JSON", "bm90IGpzb24"],
    [
      "JSON of the wrong shape",
      btoa(JSON.stringify({ offset: 50 })).replace(/=+$/, ""),
    ],
    ["empty", ""],
  ])("answers 400 for a page position that is %s", async (_, cursor) => {
    await expectInvalid({ cursor }, "cursor", cursorMessage);
  });
});

describe("no matches", () => {
  test("answers an empty batch, a count of 0 and no next position", async () => {
    const handle = await newHandle();

    const body = await browse({ publisher: handle });

    expect(body).toEqual({
      activities: [],
      count: 0,
      sort: "newest",
      nextCursor: null,
    });
  });
});
