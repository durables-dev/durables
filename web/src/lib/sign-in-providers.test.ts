import { expect, test } from "vitest";
import { signInProviders, signInStartPath } from "./sign-in-providers";

test("lists GitHub, GitLab, Google and Microsoft, in that order", () => {
  expect(signInProviders.map(({ name }) => name)).toEqual([
    "GitHub",
    "GitLab",
    "Google",
    "Microsoft",
  ]);
});

test("each provider starts at its own API start route", () => {
  expect(signInProviders.map(({ id }) => signInStartPath(id))).toEqual([
    "/api/session/providers/github",
    "/api/session/providers/gitlab",
    "/api/session/providers/google",
    "/api/session/providers/microsoft",
  ]);
});

test("carries the page a finished sign-in returns to, encoded", () => {
  expect(signInStartPath("github", "/contribute")).toBe(
    "/api/session/providers/github?returnTo=%2Fcontribute",
  );
  expect(signInStartPath("google", "/search?q=stripe")).toBe(
    "/api/session/providers/google?returnTo=%2Fsearch%3Fq%3Dstripe",
  );
});
