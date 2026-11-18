import { DetailedError } from "hono/client";
import { describe, expect, test } from "vitest";
import {
  newVersionRefusal,
  newVersionRefusalTypes,
} from "./new-version-refusal";
import {
  publishDetailsRefusedMessage,
  publishFailedMessage,
  publishLimitedMessage,
} from "./publish-refusal";

function apiError(status: number, data: unknown) {
  return new DetailedError(`${status} Error`, {
    statusCode: status,
    detail: { data, statusText: "Error" },
  });
}

function problem(status: number, type: string, extra: object = {}) {
  return apiError(status, { type, title: "Refused", status, ...extra });
}

describe("newVersionRefusal", () => {
  test.each([
    [
      409,
      newVersionRefusalTypes.versionTaken,
      "version",
      "2.1.0 already exists.",
    ],
    [
      422,
      newVersionRefusalTypes.versionNotHigher,
      "version",
      "Must be higher.",
    ],
    [422, newVersionRefusalTypes.baseNotFound, "basedOn", "No version 1.5.0."],
  ])(
    "a %i %s says the API's message for its field",
    (status, type, field, message) => {
      expect(
        newVersionRefusal(
          problem(status, type, { errors: [{ field, message }] }),
        ),
      ).toBe(message);
    },
  );

  test("a version refusal without a field message says publishing didn't go through", () => {
    expect(
      newVersionRefusal(problem(409, newVersionRefusalTypes.versionTaken)),
    ).toBe(publishFailedMessage);
  });

  test("other refusals are said as a first publish says them", () => {
    expect(
      newVersionRefusal(
        problem(422, "https://durables.dev/problems/invalid-listing"),
      ),
    ).toBe(publishDetailsRefusedMessage);
    expect(
      newVersionRefusal(
        problem(429, "https://durables.dev/problems/publish-limited"),
      ),
    ).toBe(publishLimitedMessage);
    expect(newVersionRefusal(problem(500, "about:blank"))).toBe(
      publishFailedMessage,
    );
  });

  test("a network failure says publishing didn't go through", () => {
    expect(newVersionRefusal(new TypeError("Failed to fetch"))).toBe(
      publishFailedMessage,
    );
  });
});
