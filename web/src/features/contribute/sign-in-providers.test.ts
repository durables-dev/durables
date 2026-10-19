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
