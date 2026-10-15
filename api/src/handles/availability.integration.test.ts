import { checkHandleRule, reservedHandles } from "@durables/schemas";
import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { seedAccount, seedRetiredHandle } from "../storage/seed";
import type { HandleAvailabilityResponse } from "./availability";

const problemContentType = "application/problem+json";

const check = (query: string) =>
  exports.default.fetch(`http://localhost/api/handles/availability${query}`);

const checkHandle = async (
  handle: string,
): Promise<HandleAvailabilityResponse> => {
  const response = await check(`?handle=${encodeURIComponent(handle)}`);
  expect(response.status).toBe(200);
  return response.json<HandleAvailabilityResponse>();
};

/** A handle no other test uses, so seeded rows never collide. */
const uniqueHandle = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

describe("checking a handle's availability", () => {
  test("reports an unused handle that fits the rule as available", async () => {
    const handle = uniqueHandle("free");

    expect(await checkHandle(handle)).toEqual({
      handle,
      availability: "available",
      message: `${handle} is available.`,
    });
  });

  test("reports a handle in use as taken", async () => {
    const { handle } = await seedAccount(env.DB, {
      handle: uniqueHandle("used"),
    });

    expect(await checkHandle(handle)).toEqual({
      handle,
      availability: "taken",
      message: `${handle} is taken.`,
    });
  });

  test("reports a retired handle as taken", async () => {
    const handle = uniqueHandle("retired");
    await seedRetiredHandle(env.DB, handle);

    expect(await checkHandle(handle)).toEqual({
      handle,
      availability: "taken",
      message: `${handle} is taken.`,
    });
  });

  test.each([...reservedHandles])("reports %s as taken", async (word) => {
    expect(await checkHandle(word)).toEqual({
      handle: word,
      availability: "taken",
      message: `${word} is taken.`,
    });
  });

  test("answers used, retired and reserved handles with the same result and wording", async () => {
    const used = await seedAccount(env.DB, { handle: uniqueHandle("same") });
    const retired = uniqueHandle("same");
    await seedRetiredHandle(env.DB, retired);

    const results = await Promise.all(
      [used.handle, retired, "admin"].map(async (handle) => {
        const { availability, message } = await checkHandle(handle);
        return { availability, message: message.replace(handle, "<handle>") };
      }),
    );

    expect(results).toEqual([
      { availability: "taken", message: "<handle> is taken." },
      { availability: "taken", message: "<handle> is taken." },
      { availability: "taken", message: "<handle> is taken." },
    ]);
  });

  test("accepts handles at 3 and at 39 characters", async () => {
    expect((await checkHandle("x7q")).availability).toBe("available");
    expect((await checkHandle("q".repeat(39))).availability).toBe("available");
  });

  test.each([
    ["an empty handle", ""],
    ["2 characters", "ab"],
    ["40 characters", "a".repeat(40)],
    ["an uppercase letter", "Ddieruf"],
    ["a space", "dan dieruf"],
    ["an underscore", "dan_dieruf"],
    ["a leading hyphen", "-ddieruf"],
    ["a trailing hyphen", "ddieruf-"],
    ["two hyphens in a row", "dan--dieruf"],
  ])("reports %s as invalid for format", async (_case, handle) => {
    expect(await checkHandle(handle)).toEqual({
      handle,
      availability: "invalid",
      message: "Use 3 to 39 lowercase letters, numbers and single hyphens.",
    });
  });

  test("reports an uppercase form of a used handle as invalid, not taken", async () => {
    const { handle } = await seedAccount(env.DB, {
      handle: uniqueHandle("case"),
    });

    expect((await checkHandle(handle.toUpperCase())).availability).toBe(
      "invalid",
    );
  });

  test("gives the same result as the shared rule web imports, for unused handles", async () => {
    const samples = [
      "",
      "ab",
      "abc",
      "a".repeat(39),
      "a".repeat(40),
      "Ddieruf",
      "dan dieruf",
      "dan_dieruf",
      "-lead",
      "trail-",
      "dan--dieruf",
      "dan-dieruf",
      "admin",
      "durables",
      "temporal",
      "contribute",
    ];
    const fromRule = { valid: "available", taken: "taken", invalid: "invalid" };

    for (const handle of samples) {
      expect((await checkHandle(handle)).availability, handle).toBe(
        fromRule[checkHandleRule(handle)],
      );
    }
  });

  test("answers a missing handle with a Problem Details 400", async () => {
    const response = await check("");

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
    ]);
  });

  test("is never cached", async () => {
    const response = await check("?handle=ddieruf");

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
