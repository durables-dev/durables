import { DetailedError } from "hono/client";
import { describe, expect, test } from "vitest";
import {
  publishCodeRefusedMessage,
  publishDetailsRefusedMessage,
  publishFailedMessage,
  publishLimitedMessage,
  publishRefusal,
  publishTooLargeMessage,
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

const types = {
  addressTaken: "https://durables.dev/problems/address-taken",
  handleTaken: "https://durables.dev/problems/handle-taken",
  invalidListing: "https://durables.dev/problems/invalid-listing",
  publishLimited: "https://durables.dev/problems/publish-limited",
  codeTooLarge: "https://durables.dev/problems/code-too-large",
  noActivity: "https://durables.dev/problems/no-activity",
  multipleActivities: "https://durables.dev/problems/multiple-activities",
};

describe("publishRefusal", () => {
  test("a 409 for the address sends the publisher back to Details", () => {
    expect(publishRefusal(problem(409, types.addressTaken))).toEqual({
      kind: "addressTaken",
    });
  });

  test("a 409 for the handle sends the publisher to the handle step, naming the handle", () => {
    expect(
      publishRefusal(problem(409, types.handleTaken, { handle: "ddieruf" })),
    ).toEqual({ kind: "handleTaken", handle: "ddieruf" });
  });

  test("a 409 for the handle without the handle named still goes to the handle step", () => {
    expect(publishRefusal(problem(409, types.handleTaken))).toEqual({
      kind: "handleTaken",
      handle: undefined,
    });
  });

  test("a 409 of another type is unexpected", () => {
    expect(publishRefusal(problem(409, "about:blank"))).toEqual({
      kind: "failed",
      message: publishFailedMessage,
    });
  });

  test("a 413 says the file is too large", () => {
    expect(publishRefusal(problem(413, types.codeTooLarge))).toEqual({
      kind: "failed",
      message: publishTooLargeMessage,
    });
  });

  test("a 422 for the details or confirmations says to check them", () => {
    expect(publishRefusal(problem(422, types.invalidListing))).toEqual({
      kind: "failed",
      message: publishDetailsRefusedMessage,
    });
  });

  test.each([types.noActivity, types.multipleActivities])(
    "a 422 refusing the code (%s) says the code didn't pass its check",
    (type) => {
      expect(publishRefusal(problem(422, type))).toEqual({
        kind: "failed",
        message: publishCodeRefusedMessage,
      });
    },
  );

  test("a 429 says to wait", () => {
    expect(publishRefusal(problem(429, types.publishLimited))).toEqual({
      kind: "failed",
      message: publishLimitedMessage,
    });
  });

  test.each([400, 401, 403, 500, 502])("a %i is unexpected", (status) => {
    expect(publishRefusal(problem(status, "about:blank"))).toEqual({
      kind: "failed",
      message: publishFailedMessage,
    });
  });

  test("a network failure is unexpected", () => {
    expect(publishRefusal(new TypeError("Failed to fetch"))).toEqual({
      kind: "failed",
      message: publishFailedMessage,
    });
  });
});
