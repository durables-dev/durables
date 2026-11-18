import { expect, test } from "vitest";
import {
  isProfilePath,
  sameSitePathSchema,
  signInPagePath,
} from "./account-paths";

test("the Sign in page's address carries the starting page, encoded", () => {
  expect(signInPagePath("/acme/charge-card")).toBe(
    "/sign-in?returnTo=%2Facme%2Fcharge-card",
  );
  expect(signInPagePath("/search?q=stripe")).toBe(
    "/sign-in?returnTo=%2Fsearch%3Fq%3Dstripe",
  );
});

test("the Sign in page's address without a starting page has no returnTo", () => {
  expect(signInPagePath()).toBe("/sign-in");
});

test("a same-site path is accepted", () => {
  for (const path of ["/", "/acme/charge-card@1.0.0", "/search?q=x"]) {
    expect(sameSitePathSchema.safeParse(path).success).toBe(true);
  }
});

test("anything that is not a same-site path is refused", () => {
  for (const path of [
    "",
    "acme/charge-card",
    "//evil.test/x",
    "/\\evil.test",
    "https://evil.test/",
  ]) {
    expect(sameSitePathSchema.safeParse(path).success).toBe(false);
  }
});

test("the profile and its inner pages are profile paths; nothing else is", () => {
  expect(isProfilePath("/profile")).toBe(true);
  expect(isProfilePath("/profile/activities")).toBe(true);
  expect(isProfilePath("/profiles")).toBe(false);
  expect(isProfilePath("/acme/profile")).toBe(false);
  expect(isProfilePath("/")).toBe(false);
});
