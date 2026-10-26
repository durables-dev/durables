import { DetailedError } from "hono/client";
import { expect, test } from "vitest";
import { retryQuery } from "./query-retry";

function apiError(status: number) {
  return new DetailedError(`${String(status)} Error`, {
    statusCode: status,
    detail: {
      data: { type: "about:blank", title: "Error", status },
      statusText: "Error",
    },
  });
}

test("a 404 is never tried again", () => {
  expect(retryQuery(0, apiError(404))).toBe(false);
});

test("a server error is tried again up to three times", () => {
  expect(retryQuery(0, apiError(500))).toBe(true);
  expect(retryQuery(2, apiError(500))).toBe(true);
  expect(retryQuery(3, apiError(500))).toBe(false);
});

test("a network failure is tried again up to three times", () => {
  expect(retryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
  expect(retryQuery(3, new TypeError("Failed to fetch"))).toBe(false);
});
