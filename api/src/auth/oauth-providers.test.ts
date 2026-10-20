import { afterEach, describe, expect, test, vi } from "vitest";
import { providers } from "../storage/storage";
import {
  identityScopes,
  isOAuthProvider,
  isSignInProvider,
  TimeoutError,
  withTimeout,
} from "./oauth-providers";

afterEach(() => {
  vi.useRealTimers();
});

describe("identityScopes", () => {
  test("ask each provider for identity only", () => {
    expect(identityScopes).toEqual({
      github: ["user:email"],
      gitlab: ["read_user"],
      google: ["openid", "email", "profile"],
      microsoft: ["openid", "email", "profile", "User.Read"],
    });
  });

  test("never ask GitLab for a repository, group or API scope", () => {
    for (const scope of identityScopes.gitlab) {
      expect(scope).not.toMatch(/repository|group|api|write|sudo|admin/iu);
    }
  });

  test("never include a repository or organization scope for any provider", () => {
    const repositoryOrOrganization = /repo|org|gist|workflow|write|admin/iu;
    for (const provider of providers) {
      for (const scope of identityScopes[provider]) {
        expect(scope).not.toMatch(repositoryOrOrganization);
      }
    }
  });
});

describe("isOAuthProvider", () => {
  test("accepts GitHub, Google and Microsoft", () => {
    expect(["github", "google", "microsoft"].every(isOAuthProvider)).toBe(true);
  });

  test("refuses GitLab, whose flow is hand-written", () => {
    expect(isOAuthProvider("gitlab")).toBe(false);
  });

  test("refuses any other name", () => {
    expect(isOAuthProvider("myspace")).toBe(false);
    expect(isOAuthProvider("GitHub")).toBe(false);
    expect(isOAuthProvider("")).toBe(false);
  });
});

describe("isSignInProvider", () => {
  test("accepts all four providers, GitLab included", () => {
    expect(
      ["github", "gitlab", "google", "microsoft"].every(isSignInProvider),
    ).toBe(true);
  });

  test("refuses any other name", () => {
    expect(isSignInProvider("myspace")).toBe(false);
    expect(isSignInProvider("GitLab")).toBe(false);
    expect(isSignInProvider("")).toBe(false);
  });
});

describe("withTimeout", () => {
  test("returns the work's result when it settles in time", async () => {
    await expect(withTimeout(Promise.resolve("done"), 1000)).resolves.toBe(
      "done",
    );
  });

  test("passes the work's failure through", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("refused")), 1000),
    ).rejects.toThrow("refused");
  });

  test("fails with a TimeoutError when the work does not settle in time", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => undefined), 1000);
    const outcome = expect(pending).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(1000);

    await outcome;
  });

  test("clears its timer once the work settles", async () => {
    vi.useFakeTimers();

    await withTimeout(Promise.resolve("done"), 1000);

    expect(vi.getTimerCount()).toBe(0);
  });
});
