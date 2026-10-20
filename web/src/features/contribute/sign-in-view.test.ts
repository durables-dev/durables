import { expect, test } from "vitest";
import { readSignInView, signInAgainPath, signInParam } from "./sign-in-view";

test("reads the failure the API sends a sign-in that did not finish back with", () => {
  // The API's signInFailedPath, as the browser arrives at it.
  const url = new URL("/contribute/profile?sign-in=failed", "https://x.test");
  expect(readSignInView(url.searchParams.get(signInParam))).toBe("failed");
});

test("reads the sign-in view opened again by a signed-in publisher", () => {
  const url = new URL(signInAgainPath, "https://x.test");
  expect(url.pathname).toBe("/contribute/profile");
  expect(readSignInView(url.searchParams.get(signInParam))).toBe("again");
});

test("asks for no sign-in view when the param is missing or unknown", () => {
  expect(readSignInView(null)).toBeUndefined();
  expect(readSignInView("")).toBeUndefined();
  expect(readSignInView("FAILED")).toBeUndefined();
  expect(readSignInView("cancelled")).toBeUndefined();
});
