import { expect, test } from "vitest";
import { readSignInAddress } from "./sign-in-address";

function read(search: string) {
  return readSignInAddress(
    new URL(`/sign-in${search}`, "https://x.test").searchParams,
  );
}

test("opened directly, there is no failure and no starting page", () => {
  expect(read("")).toEqual({ failed: false, returnTo: undefined });
});

test("reads the starting page the header's Sign in link passes", () => {
  expect(read("?returnTo=%2Facme%2Fcharge-card")).toEqual({
    failed: false,
    returnTo: "/acme/charge-card",
  });
});

test("reads the failure and the starting page the api lands a failed sign-in with", () => {
  // api: session/sign-in.ts, signInFailedLocation.
  expect(read("?sign-in=failed&returnTo=%2Facme%2Fcharge-card")).toEqual({
    failed: true,
    returnTo: "/acme/charge-card",
  });
  expect(read("?sign-in=failed")).toEqual({
    failed: true,
    returnTo: undefined,
  });
});

test("an unknown sign-in value is not a failure", () => {
  expect(read("?sign-in=again").failed).toBe(false);
  expect(read("?sign-in=FAILED").failed).toBe(false);
  expect(read("?sign-in=").failed).toBe(false);
});

test("a starting page that is not a same-site path is left out", () => {
  for (const value of [
    "https%3A%2F%2Fevil.test%2F",
    "%2F%2Fevil.test",
    "acme%2Fcharge-card",
    "",
  ]) {
    expect(read(`?returnTo=${value}`).returnTo).toBeUndefined();
  }
});
