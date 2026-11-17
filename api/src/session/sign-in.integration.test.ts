import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Hono } from "hono";
import { generateSignedCookie } from "hono/cookie";
import type { AppEnv } from "../app-env";
import { Auth } from "../auth/auth";
import { identityScopes } from "../auth/oauth-providers";
import { onError } from "../http/error-handlers";
import app from "../index";
import { readAllRows, seedAccount } from "../storage/seed";
import {
  noAccountPath,
  defaultLandingPath,
  signIn as signInRoutes,
  signInFailedPath,
} from "./sign-in";

// The OAuth providers are the outside world, so only their endpoints are faked: a stand-in
// for the global fetch answers the token, user and email requests the sign-in package makes.
// D1 and every internal module are real, and requests go to the Worker over HTTP.

const providers = ["github", "gitlab", "google", "microsoft"] as const;
type Provider = (typeof providers)[number];

const problemContentType = "application/problem+json";

// The real sign-in routes behind the real auth interface, with a 50 ms exchange timeout so a
// slow provider can be exercised without waiting the full ten seconds.
const shortTimeoutApp = new Hono<AppEnv>()
  .use(async (c, next) => {
    c.set(
      "auth",
      new Auth(
        c,
        c.env.SESSION_SIGNING_KEY,
        {
          gitlab: {
            clientId: c.env.GITLAB_CLIENT_ID,
            clientSecret: c.env.GITLAB_CLIENT_SECRET,
          },
          microsoft: {
            clientId: c.env.MICROSOFT_CLIENT_ID,
            clientSecret: c.env.MICROSOFT_CLIENT_SECRET,
          },
        },
        { exchangeTimeoutMs: 50 },
      ),
    );
    await next();
  })
  .route("/api/session/providers", signInRoutes)
  .onError(onError);

const accessToken = "provider-access-token-never-kept";
const refreshToken = "provider-refresh-token-never-kept";
const code = "provider-code-never-kept";
const email = "ada.never-logged@example.com";

const authorizeUrls: Record<Provider, string> = {
  github: "https://github.com/login/oauth/authorize",
  gitlab: "https://gitlab.com/oauth/authorize",
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  microsoft: "https://login.microsoft.com/common/oauth2/v2.0/authorize",
};

const tokenUrls: Record<Provider, string> = {
  github: "https://github.com/login/oauth/access_token",
  gitlab: "https://gitlab.com/oauth/token",
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoft.com/common/oauth2/v2.0/token",
};

const userUrls: Record<Provider, string> = {
  github: "https://api.github.com/user",
  gitlab: "https://gitlab.com/api/v4/user",
  google: "https://www.googleapis.com/oauth2/v2/userinfo",
  microsoft: "https://graph.microsoft.com/v1.0/me",
};

const githubEmailsUrl = "https://api.github.com/user/emails";

/**
 * The handle each provider's fake account suggests: the username for GitHub and GitLab, and
 * the cleaned part of the email before the @ for Google and Microsoft.
 */
const suggestedHandles: Record<Provider, string> = {
  github: "ada",
  gitlab: "ada",
  google: "ada-never-logged",
  microsoft: "ada-never-logged",
};

const grantedScopes: Record<Provider, string> = {
  github: "user:email",
  gitlab: "read_user",
  google: "openid email profile",
  microsoft: "openid email profile User.Read",
};

/** A provider's user record for an account ID, in that provider's own shape. */
const providerUser = (provider: Provider, accountId: string): unknown => {
  switch (provider) {
    case "github":
      return {
        id: Number(accountId),
        login: "ada",
        name: "Ada Lovelace",
        avatar_url: "https://avatars.example.com/ada",
      };
    case "gitlab":
      return {
        id: Number(accountId),
        username: "ada",
        name: "Ada Lovelace",
        email,
        avatar_url: "https://gitlab.example.com/ada.png",
        state: "active",
      };
    case "google":
      return {
        id: accountId,
        name: "Ada Lovelace",
        email,
        picture: "https://example.com/ada.png",
      };
    case "microsoft":
      return { id: accountId, displayName: "Ada Lovelace", mail: email };
  }
};

interface ProviderAnswers {
  token?: () => Promise<Response>;
  user?: unknown;
  /** Replaces the whole user response, for a provider that fails after the exchange. */
  userResponse?: () => Promise<Response>;
  emails?: unknown;
}

/** Every request the Worker made to a provider, by URL. */
let providerRequests: string[] = [];

interface LoggedRequest {
  method: string;
  url: string;
  headers: Headers;
  body: string;
}

/** Every request the Worker made to a provider, in full. */
let providerRequestLog: LoggedRequest[] = [];

/** Fakes the provider's endpoints. Any other outbound request fails the test. */
const fakeProvider = (provider: Provider, answers: ProviderAnswers = {}) => {
  const accountId = String(Math.floor(Math.random() * 1_000_000_000));
  const user = answers.user ?? providerUser(provider, accountId);
  const token =
    answers.token ??
    (() =>
      Promise.resolve(
        Response.json({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
          token_type: "bearer",
          scope: grantedScopes[provider],
        }),
      ));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = request.url.split("?")[0] ?? "";
    providerRequests.push(url);
    // Read the body here: it cannot be read later, outside the request's I/O context.
    providerRequestLog.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: new TextDecoder().decode(await request.arrayBuffer()),
    });
    if (request.method === "POST" && url === tokenUrls[provider]) {
      return token();
    }
    if (request.method === "GET" && url === userUrls[provider]) {
      return answers.userResponse?.() ?? Response.json(user);
    }
    if (request.method === "GET" && url === githubEmailsUrl) {
      return Response.json(
        answers.emails ?? [{ email, primary: true, verified: true }],
      );
    }
    throw new Error(`Unexpected request to ${url}`);
  });
  return { accountId };
};

const get = (path: string, cookie?: string) =>
  exports.default.fetch(`http://localhost${path}`, {
    redirect: "manual",
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });

/** Every Set-Cookie header on a response. */
const setCookies = (response: Response): string[] =>
  response.headers.getSetCookie();

/** The name=value pair of the cookie with this name, if the response sets one. */
const cookieNamed = (response: Response, name: string): string | undefined =>
  setCookies(response)
    .map((header) => header.split(";")[0] ?? "")
    .find((pair) => pair.startsWith(`${name}=`));

/**
 * Starts sign-in, from a starting page when one is given, and returns the state the provider
 * is sent, the cookie that holds it, and the cookie that keeps the starting page.
 */
const start = async (provider: Provider, startingPage?: string) => {
  const response = await get(
    startingPage === undefined
      ? `/api/session/providers/${provider}`
      : `/api/session/providers/${provider}?returnTo=${encodeURIComponent(startingPage)}`,
  );
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("Location") ?? "");
  const stateCookie = cookieNamed(response, "state") ?? "";
  return {
    response,
    location,
    state: location.searchParams.get("state") ?? "",
    stateCookie,
    startingPageCookie: cookieNamed(response, "__Host-sign-in-return"),
  };
};

/** The Cookie header a browser sends back with the callback. */
const cookieHeader = (...cookies: (string | undefined)[]): string =>
  cookies.filter((cookie) => cookie !== undefined).join("; ");

const callback = (provider: string, query: string, cookie?: string) =>
  get(`/api/session/providers/${provider}/callback?${query}`, cookie);

/** Runs a whole sign-in, from a starting page when one is given, and returns the callback's response. */
const signIn = async (provider: Provider, startingPage?: string) => {
  const { state, stateCookie, startingPageCookie } = await start(
    provider,
    startingPage,
  );
  return callback(
    provider,
    `code=${code}&state=${encodeURIComponent(state)}`,
    cookieHeader(stateCookie, startingPageCookie),
  );
};

const readSession = async (response: Response) => {
  const cookie = cookieNamed(response, "__Host-session");
  expect(cookie).toBeDefined();
  const session = await get("/api/session", cookie);
  return session.json<{ user: Record<string, unknown> | null }>();
};

/** What the signed session cookie carries, read without the API. */
const sessionPayload = (response: Response): Record<string, unknown> => {
  const value = decodeURIComponent(
    cookieNamed(response, "__Host-session")?.split("=").slice(1).join("=") ??
      "",
  );
  return JSON.parse(value.slice(0, value.lastIndexOf("."))) as Record<
    string,
    unknown
  >;
};

/** The failure redirect for a sign-in started from /acme/charge-card, which keeps that page. */
const failedFromChargeCard =
  "/sign-in?sign-in=failed&returnTo=%2Facme%2Fcharge-card";

const expectFailureRedirect = (
  response: Response,
  location: string = signInFailedPath,
) => {
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(location);
  expect(cookieNamed(response, "__Host-session")).toBeUndefined();
};

/** Captures everything logged at every level. */
const captureLogs = () => {
  const spies = (["log", "info", "warn", "error", "debug"] as const).map(
    (level) => vi.spyOn(console, level).mockImplementation(() => undefined),
  );
  return () => JSON.stringify(spies.map((spy) => spy.mock.calls));
};

beforeEach(() => {
  providerRequests = [];
  providerRequestLog = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/session/providers/:provider", () => {
  test.each(providers)(
    "redirects to %s with identity-only scopes and stores the state",
    async (provider) => {
      const { response, location, state, stateCookie } = await start(provider);

      expect(`${location.origin}${location.pathname}`).toBe(
        authorizeUrls[provider],
      );
      expect(location.searchParams.get("scope")?.split(" ")).toEqual(
        identityScopes[provider],
      );
      expect(location.searchParams.get("client_id")).toBe("local-placeholder");
      // A GitHub OAuth app returns to the callback registered with it, so none is sent.
      expect(location.searchParams.get("redirect_uri")).toBe(
        provider === "github"
          ? null
          : `http://localhost/api/session/providers/${provider}/callback`,
      );
      expect(state).not.toBe("");
      expect(stateCookie).toBe(`state=${state}`);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(cookieNamed(response, "__Host-session")).toBeUndefined();
    },
  );

  test.each(providers)(
    "never asks %s for a repository or organization scope",
    async (provider) => {
      const { location } = await start(provider);

      const scope = location.searchParams.get("scope") ?? "";
      expect(scope).not.toMatch(/repo|org|gist|workflow|write|admin/iu);
    },
  );

  test("answers 404 for an unknown provider", async () => {
    const response = await get("/api/session/providers/myspace");

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(response.headers.get("Location")).toBeNull();
    expect(cookieNamed(response, "state")).toBeUndefined();
  });

  test("answers 400 when the start request carries a code", async () => {
    const response = await get(`/api/session/providers/github?code=${code}`);

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
  });

  test.each([
    [
      "google",
      "start",
      "/api/session/providers/google",
      "GOOGLE_CLIENT_SECRET",
    ],
    [
      "google",
      "callback",
      `/api/session/providers/google/callback?code=${code}&state=any-state`,
      "GOOGLE_CLIENT_SECRET",
    ],
    [
      "gitlab",
      "start",
      "/api/session/providers/gitlab",
      "GITLAB_CLIENT_SECRET",
    ],
    [
      "gitlab",
      "callback",
      `/api/session/providers/gitlab/callback?code=${code}&state=any-state`,
      "GITLAB_CLIENT_SECRET",
    ],
  ])(
    "takes the failure redirect on %s %s when the provider's credentials are missing",
    async (_provider, _route, path, secret) => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await app.request(
        path,
        {},
        { ...env, [secret]: undefined },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(signInFailedPath);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(log).toHaveBeenCalledOnce();
    },
  );
});

describe("GET /api/session/providers/:provider/callback", () => {
  test.each(providers)(
    "establishes a session for %s and sends someone with no account into Contribute at Profile & Handle",
    async (provider) => {
      fakeProvider(provider);

      const response = await signIn(provider);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(noAccountPath);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await readSession(response)).toEqual({
        user: {
          name: "Ada Lovelace",
          initials: "AL",
          provider,
          suggestedHandle: suggestedHandles[provider],
          handle: null,
          accountExists: false,
        },
      });
    },
  );

  test.each(providers)(
    "clears the state cookie after the %s callback",
    async (provider) => {
      fakeProvider(provider);

      const response = await signIn(provider);

      const cleared = setCookies(response).find((header) =>
        header.startsWith("state="),
      );
      expect(cleared).toMatch(/^state=;/);
      expect(cleared).toContain("Max-Age=0");
    },
  );

  test.each(providers)(
    "shows account-exists, and lands on the home page, for a %s account already linked to a Durables account",
    async (provider) => {
      const { accountId } = fakeProvider(provider);
      await seedAccount(env.DB, { provider, providerAccountId: accountId });

      const response = await signIn(provider);

      expect(response.headers.get("Location")).toBe(defaultLandingPath);
      expect(await readSession(response)).toMatchObject({
        user: { provider, accountExists: true },
      });
    },
  );

  test.each(providers)(
    "redirects with the failure indicator when the %s state does not match",
    async (provider) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      fakeProvider(provider);
      const { stateCookie } = await start(provider);

      const response = await callback(
        provider,
        `code=${code}&state=someone-elses-state`,
        stateCookie,
      );

      expectFailureRedirect(response);
      expect(providerRequests).toEqual([]);
    },
  );

  test("redirects with the failure indicator when no state was stored", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fakeProvider("github");

    const response = await callback("github", `code=${code}&state=abc`);

    expectFailureRedirect(response);
    expect(providerRequests).toEqual([]);
  });

  test.each(providers)(
    "redirects with the failure indicator when %s answers with an error",
    async (provider) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      fakeProvider(provider);
      const { state, stateCookie } = await start(provider);

      const response = await callback(
        provider,
        `error=server_error&state=${encodeURIComponent(state)}`,
        stateCookie,
      );

      expectFailureRedirect(response);
      expect(providerRequests).toEqual([]);
    },
  );

  test.each(providers)(
    "redirects with the failure indicator when the visitor cancels at %s",
    async (provider) => {
      fakeProvider(provider);
      const { state, stateCookie } = await start(provider);

      const response = await callback(
        provider,
        `error=access_denied&state=${encodeURIComponent(state)}`,
        stateCookie,
      );

      expectFailureRedirect(response);
    },
  );

  test("redirects with the failure indicator when the callback has no code", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { state, stateCookie } = await start("google");

    const response = await callback(
      "google",
      `state=${encodeURIComponent(state)}`,
      stateCookie,
    );

    expectFailureRedirect(response);
  });

  const exchangeErrors: Record<Provider, unknown> = {
    github: {
      error: "bad_verification_code",
      error_description: "The code passed is incorrect or expired.",
    },
    gitlab: {
      error: "invalid_grant",
      error_description:
        "The provided authorization grant is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.",
    },
    google: { error: "invalid_grant", error_description: "Bad Request" },
    microsoft: { error: "invalid_grant" },
  };

  test.each(providers)(
    "redirects with the failure indicator when the %s token exchange fails",
    async (provider) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      fakeProvider(provider, {
        token: () =>
          Promise.resolve(
            Response.json(exchangeErrors[provider], { status: 400 }),
          ),
      });

      const response = await signIn(provider);

      expectFailureRedirect(response);
    },
  );

  test("redirects with the failure indicator when the provider cannot be reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fakeProvider("google", {
      token: () => Promise.reject(new TypeError("Network connection lost.")),
    });

    const response = await signIn("google");

    expectFailureRedirect(response);
  });

  test.each(["microsoft", "gitlab"] as const)(
    "redirects with the failure indicator when the %s exchange times out",
    async (provider) => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const { state, stateCookie } = await start(provider);
      // The provider answers, with a refusal, only well after a short exchange timeout.
      fakeProvider(provider, {
        token: () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => {
              resolve(Response.json({ error: "too_late" }, { status: 400 }));
            }, 500);
          }),
      });

      const response = await shortTimeoutApp.request(
        `/api/session/providers/${provider}/callback?code=${code}&state=${encodeURIComponent(state)}`,
        { headers: { Cookie: stateCookie } },
        env,
      );

      expectFailureRedirect(response);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ provider, reason: "timeout" }),
      );
    },
  );

  test("completes without an email when the provider returns none", async () => {
    fakeProvider("github", {
      user: { id: 77, login: "ada", name: "Ada Lovelace", email: null },
      emails: [],
    });

    const response = await signIn("github");

    expect(response.headers.get("Location")).toBe(noAccountPath);
    expect(await readSession(response)).toMatchObject({
      user: { name: "Ada Lovelace", provider: "github" },
    });
  });

  test("redirects with the failure indicator when the provider returns no usable identity", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fakeProvider("google", { user: { id: "g-1", email } });

    const response = await signIn("google");

    expectFailureRedirect(response);
  });

  test("answers 404 for an unknown provider", async () => {
    const response = await callback("myspace", `code=${code}&state=abc`);

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
  });

  test.each(providers)(
    "never asks for or creates a password with %s",
    async (provider) => {
      fakeProvider(provider);
      const { location } = await start(provider);

      const response = await signIn(provider);

      expect(location.search).not.toMatch(/password/iu);
      expect(response.headers.get("Location")).not.toMatch(/password/iu);
      expect(JSON.stringify(await readSession(response))).not.toMatch(
        /password/iu,
      );
    },
  );
});

describe("where a finished sign-in lands", () => {
  const startingPageCookiePrefix = "__Host-sign-in-return=";

  /** The Set-Cookie header for the starting page cookie, if the response sets one. */
  const startingPageSetCookie = (response: Response): string | undefined =>
    setCookies(response).find((header) =>
      header.startsWith(startingPageCookiePrefix),
    );

  /** A provider account already linked to a Durables account. */
  const existingAccount = async (provider: Provider) => {
    const { accountId } = fakeProvider(provider);
    await seedAccount(env.DB, { provider, providerAccountId: accountId });
  };

  test("lands an existing account on the home page by default", () => {
    expect(defaultLandingPath).toBe("/");
  });

  test("sends someone with no account into Contribute at Profile & Handle", () => {
    expect(noAccountPath).toBe("/contribute/profile");
  });

  test("sends a sign-in that did not finish to the Sign in page with the failure indicator", () => {
    expect(signInFailedPath).toBe("/sign-in?sign-in=failed");
  });

  test.each(providers)(
    "returns an existing %s account to the page sign-in started from",
    async (provider) => {
      await existingAccount(provider);

      const response = await signIn(provider, "/acme/charge-card");

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/acme/charge-card");
      expect(await readSession(response)).toMatchObject({
        user: { provider, accountExists: true },
      });
    },
  );

  test("keeps the starting page on the failure redirect when the provider can't be used", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await app.request(
      "/api/session/providers/github?returnTo=%2Fsearch%3Fq%3Dstripe",
      {},
      { ...env, GITHUB_CLIENT_SECRET: undefined },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/sign-in?sign-in=failed&returnTo=%2Fsearch%3Fq%3Dstripe",
    );
  });

  test("leaves a refused starting page off the failure redirect", async () => {
    const { state, stateCookie, startingPageCookie } = await start(
      "github",
      "https://evil.example/x",
    );

    const response = await callback(
      "github",
      `error=access_denied&state=${encodeURIComponent(state)}`,
      cookieHeader(stateCookie, startingPageCookie),
    );

    expect(response.headers.get("Location")).toBe(signInFailedPath);
  });

  test("keeps the starting page's version and query", async () => {
    await existingAccount("github");

    const versioned = await signIn("github", "/acme/charge-card@2.0.0");
    await existingAccount("github");
    const searched = await signIn("github", "/search?q=stripe&sdk=go");

    expect(versioned.headers.get("Location")).toBe("/acme/charge-card@2.0.0");
    expect(searched.headers.get("Location")).toBe("/search?q=stripe&sdk=go");
  });

  test.each(providers)(
    "keeps the %s starting page in a signed, HttpOnly cookie bound to the state",
    async (provider) => {
      const { state, startingPageCookie, response } = await start(
        provider,
        "/acme/charge-card",
      );

      const header = startingPageSetCookie(response) ?? "";
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
      expect(header).toContain("SameSite=Lax");
      expect(header).toContain("Path=/");
      expect(header).toContain("Max-Age=600");
      const value = decodeURIComponent(
        startingPageCookie?.slice(startingPageCookiePrefix.length) ?? "",
      );
      expect(JSON.parse(value.slice(0, value.lastIndexOf(".")))).toEqual({
        state,
        page: "/acme/charge-card",
      });
    },
  );

  test.each(providers)(
    "clears the starting page cookie after the %s callback",
    async (provider) => {
      await existingAccount(provider);

      const response = await signIn(provider, "/acme/charge-card");

      const cleared = startingPageSetCookie(response);
      expect(cleared).toMatch(/^__Host-sign-in-return=;/);
      expect(cleared).toContain("Max-Age=0");
    },
  );

  test.each([
    ["an absolute URL", "https://evil.example/x"],
    ["a protocol-relative URL", "//evil.example"],
    ["a protocol-relative URL with a path", "//evil.example/acme/charge-card"],
    ["a backslash that browsers read as a slash", "/\\evil.example"],
    ["a relative path", "evil.example"],
  ])("ignores %s as the starting page", async (_case, startingPage) => {
    await existingAccount("github");

    const started = await start("github", startingPage);
    const response = await signIn("github", startingPage);

    expect(started.startingPageCookie).toBeUndefined();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(defaultLandingPath);
  });

  test("lands on the home page when no starting page is given", async () => {
    await existingAccount("google");

    const { startingPageCookie } = await start("google");
    const response = await signIn("google");

    expect(startingPageCookie).toBeUndefined();
    expect(response.headers.get("Location")).toBe(defaultLandingPath);
  });

  test("falls back to the home page when the starting page cookie is lost", async () => {
    await existingAccount("github");
    const { state, stateCookie } = await start("github", "/acme/charge-card");

    const response = await callback(
      "github",
      `code=${code}&state=${encodeURIComponent(state)}`,
      stateCookie,
    );

    expect(response.headers.get("Location")).toBe(defaultLandingPath);
  });

  test("falls back to the home page when the starting page cookie is tampered with", async () => {
    await existingAccount("github");
    const { state, stateCookie, startingPageCookie } = await start(
      "github",
      "/acme/charge-card",
    );
    const tampered = (startingPageCookie ?? "").replace(
      encodeURIComponent("/acme/charge-card"),
      encodeURIComponent("/acme/refund-card"),
    );
    expect(tampered).not.toBe(startingPageCookie);

    const response = await callback(
      "github",
      `code=${code}&state=${encodeURIComponent(state)}`,
      cookieHeader(stateCookie, tampered),
    );

    expect(response.headers.get("Location")).toBe(defaultLandingPath);
  });

  test("falls back to the home page when the starting page belongs to another sign-in", async () => {
    await existingAccount("github");
    const earlier = await start("github", "/acme/charge-card");
    const { state, stateCookie } = await start("github");

    const response = await callback(
      "github",
      `code=${code}&state=${encodeURIComponent(state)}`,
      cookieHeader(stateCookie, earlier.startingPageCookie),
    );

    expect(earlier.startingPageCookie).toBeDefined();
    expect(response.headers.get("Location")).toBe(defaultLandingPath);
  });

  test("checks the kept starting page again at the callback", async () => {
    await existingAccount("github");
    const { state, stateCookie } = await start("github");
    // A cookie signed with the real key, so only the callback's own check can refuse it.
    const signed = await generateSignedCookie(
      "sign-in-return",
      JSON.stringify({ state, page: "//evil.example" }),
      env.SESSION_SIGNING_KEY,
      { prefix: "host" },
    );

    const response = await callback(
      "github",
      `code=${code}&state=${encodeURIComponent(state)}`,
      cookieHeader(stateCookie, signed.split(";")[0]),
    );

    expect(response.headers.get("Location")).toBe(defaultLandingPath);
  });

  test.each(providers)(
    "sends someone with no %s account into Contribute at Profile & Handle, whatever the starting page",
    async (provider) => {
      fakeProvider(provider);

      const response = await signIn(provider, "/acme/charge-card");

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(noAccountPath);
      expect(await readSession(response)).toMatchObject({
        user: { provider, accountExists: false },
      });
    },
  );

  test.each(providers)(
    "sends a cancelled %s sign-in to the Sign in page, keeping the starting page there, and clears the cookie",
    async (provider) => {
      fakeProvider(provider);
      const { state, stateCookie, startingPageCookie } = await start(
        provider,
        "/acme/charge-card",
      );

      const response = await callback(
        provider,
        `error=access_denied&state=${encodeURIComponent(state)}`,
        cookieHeader(stateCookie, startingPageCookie),
      );

      expectFailureRedirect(response, failedFromChargeCard);
      expect(startingPageSetCookie(response)).toContain("Max-Age=0");
    },
  );

  test.each(providers)(
    "sends a %s sign-in whose exchange fails to the Sign in page, keeping the starting page",
    async (provider) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      fakeProvider(provider, {
        token: () =>
          Promise.resolve(
            Response.json(
              {
                error: "invalid_grant",
                error_description: "The code passed is incorrect or expired.",
              },
              { status: 400 },
            ),
          ),
      });

      const response = await signIn(provider, "/acme/charge-card");

      expectFailureRedirect(response, failedFromChargeCard);
    },
  );
});

describe("the suggested handle", () => {
  test.each(["github", "gitlab"] as const)(
    "is the cleaned %s username, with the provider named",
    async (provider) => {
      const usernameField = provider === "github" ? "login" : "username";
      fakeProvider(provider, {
        user: { id: 51, [usernameField]: "Octo_Cat", name: "Octo Cat", email },
      });

      const response = await signIn(provider);

      expect(await readSession(response)).toMatchObject({
        user: { provider, suggestedHandle: "octo-cat" },
      });
    },
  );

  test.each(["google", "microsoft"] as const)(
    "is the cleaned part of the %s email before the @, with the provider named",
    async (provider) => {
      const user =
        provider === "google"
          ? { id: "g-51", name: "Jane Doe", email: "Jane.Doe+x@example.com" }
          : {
              id: "m-51",
              displayName: "Jane Doe",
              mail: "Jane.Doe+x@example.com",
            };
      fakeProvider(provider, { user });

      const response = await signIn(provider);

      expect(await readSession(response)).toMatchObject({
        user: { provider, suggestedHandle: "jane-doe-x" },
      });
    },
  );

  test("is left out when the username cleans to under 3 characters", async () => {
    fakeProvider("github", { user: { id: 52, login: "A_", name: "Ada" } });

    const response = await signIn("github");

    const { user } = await readSession(response);
    expect(user).toMatchObject({ provider: "github", name: "Ada" });
    expect(user).not.toHaveProperty("suggestedHandle");
    expect(sessionPayload(response)).not.toHaveProperty("suggestedHandle");
  });

  test("is left out when Google returns no email", async () => {
    fakeProvider("google", { user: { id: "g-52", name: "Ada" } });

    const response = await signIn("google");

    expect((await readSession(response)).user).not.toHaveProperty(
      "suggestedHandle",
    );
  });

  test("is still returned when it is a reserved word", async () => {
    fakeProvider("google", {
      user: { id: "g-53", name: "Ada", email: "admin@example.com" },
    });

    const response = await signIn("google");

    expect(await readSession(response)).toMatchObject({
      user: { suggestedHandle: "admin" },
    });
  });

  test("is kept in the session cookie at sign-in", async () => {
    fakeProvider("microsoft");

    const response = await signIn("microsoft");

    expect(sessionPayload(response)).toMatchObject({
      provider: "microsoft",
      suggestedHandle: "ada-never-logged",
      handle: null,
    });
  });

  test.each(providers)(
    "comes with a %s session read that names the provider and never contains the email",
    async (provider) => {
      const logs = captureLogs();
      fakeProvider(provider);

      const response = await signIn(provider);
      const session = await get(
        "/api/session",
        cookieNamed(response, "__Host-session"),
      );

      const body = await session.text();
      expect(JSON.parse(body)).toMatchObject({
        user: { provider, suggestedHandle: suggestedHandles[provider] },
      });
      expect(body).not.toContain(email);
      expect(body).not.toContain("example.com");
      expect(logs()).not.toContain(email);
    },
  );
});

describe("GitLab sign-in, hand-written beside the package", () => {
  test("keeps the GitLab username and provider in the session", async () => {
    fakeProvider("gitlab");

    const response = await signIn("gitlab");

    expect(response.headers.get("Location")).toBe(noAccountPath);
    expect(sessionPayload(response)).toMatchObject({
      provider: "gitlab",
      name: "Ada Lovelace",
      username: "ada",
      handle: null,
    });
    expect(await readSession(response)).toMatchObject({
      user: { provider: "gitlab", name: "Ada Lovelace" },
    });
  });

  test("uses the GitLab username as the name when the account has no name", async () => {
    fakeProvider("gitlab", { user: { id: 31, username: "ghopper", name: "" } });

    const response = await signIn("gitlab");

    expect(await readSession(response)).toMatchObject({
      user: { provider: "gitlab", name: "ghopper" },
    });
  });

  test("exchanges the code at GitLab with the callback, then reads the user with the token", async () => {
    fakeProvider("gitlab");

    await signIn("gitlab");

    const [tokenRequest, userRequest] = providerRequestLog;
    expect(tokenRequest?.method).toBe("POST");
    const body = new URLSearchParams(tokenRequest?.body);
    expect(Object.fromEntries(body)).toEqual({
      client_id: "local-placeholder",
      client_secret: "local-placeholder",
      code,
      grant_type: "authorization_code",
      redirect_uri: "http://localhost/api/session/providers/gitlab/callback",
    });
    expect(userRequest?.url).toBe(userUrls.gitlab);
    expect(userRequest?.headers.get("Authorization")).toBe(
      `Bearer ${accessToken}`,
    );
    expect(providerRequestLog).toHaveLength(2);
  });

  test("starts each GitLab sign-in with a fresh, unguessable state", async () => {
    const first = await start("gitlab");
    const second = await start("gitlab");

    expect(first.state).toMatch(/^[\w-]{43}$/u);
    expect(second.state).not.toBe(first.state);
    const stateHeader = setCookies(first.response).find((header) =>
      header.startsWith("state="),
    );
    expect(stateHeader).toContain("HttpOnly");
    expect(stateHeader).toContain("Secure");
    expect(stateHeader).toContain("SameSite=Lax");
    expect(stateHeader).toContain("Max-Age=600");
  });

  test.each([
    [
      "answers with an error",
      () =>
        Promise.resolve(
          Response.json({ message: "401 Unauthorized" }, { status: 401 }),
        ),
    ],
    [
      "cannot be reached",
      () => Promise.reject(new TypeError("Network connection lost.")),
    ],
    [
      "answers with something that is not JSON",
      () => Promise.resolve(new Response("<html>", { status: 200 })),
    ],
  ])(
    "creates no session when the GitLab profile fetch %s after a successful exchange",
    async (_case, userResponse) => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      fakeProvider("gitlab", { userResponse });

      const response = await signIn("gitlab");

      expectFailureRedirect(response);
      expect(providerRequests).toEqual([tokenUrls.gitlab, userUrls.gitlab]);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "gitlab",
          reason: "profile-failed",
        }),
      );
    },
  );

  test("redirects with the failure indicator when GitLab answers the exchange without a token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fakeProvider("gitlab", {
      token: () => Promise.resolve(Response.json({ token_type: "Bearer" })),
    });

    const response = await signIn("gitlab");

    expectFailureRedirect(response);
    expect(providerRequests).toEqual([tokenUrls.gitlab]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gitlab",
        reason: "exchange-failed",
      }),
    );
  });

  test("never logs or stores the token or email when the GitLab profile fetch fails", async () => {
    const logs = captureLogs();
    fakeProvider("gitlab", {
      userResponse: () =>
        Promise.resolve(
          Response.json(
            { message: `Token ${accessToken} for ${email} was refused` },
            { status: 401 },
          ),
        ),
    });
    const before = JSON.stringify(await readAllRows(env.DB));

    await signIn("gitlab");

    const logged = logs();
    expect(logged).toContain("Sign-in did not finish");
    for (const secret of [accessToken, refreshToken, code, email]) {
      expect(logged).not.toContain(secret);
    }
    expect(JSON.stringify(await readAllRows(env.DB))).toBe(before);
  });
});

describe("provider tokens and the email", () => {
  test.each(providers)(
    "are not logged, and tokens are not stored, through a %s sign-in",
    async (provider) => {
      const logs = captureLogs();
      fakeProvider(provider);
      const before = JSON.stringify(await readAllRows(env.DB));

      const response = await signIn(provider);
      await readSession(response);

      const logged = logs();
      for (const secret of [accessToken, refreshToken, code, email]) {
        expect(logged).not.toContain(secret);
      }
      const sessionCookie = decodeURIComponent(
        cookieNamed(response, "__Host-session") ?? "",
      );
      expect(sessionCookie).toContain("Ada Lovelace");
      expect(sessionCookie).not.toContain(accessToken);
      expect(sessionCookie).not.toContain(refreshToken);
      expect(sessionCookie).not.toContain(code);
      const after = JSON.stringify(await readAllRows(env.DB));
      expect(after).toBe(before);
      expect(after).not.toContain(accessToken);
      expect(after).not.toContain(email);
    },
  );

  test.each(providers)(
    "are not logged when the %s exchange fails",
    async (provider) => {
      const logs = captureLogs();
      fakeProvider(provider, {
        token: () =>
          Promise.resolve(
            Response.json(
              {
                error: "invalid_grant",
                error_description: `Code ${code} for ${email} was refused`,
              },
              { status: 400 },
            ),
          ),
      });

      await signIn(provider);

      const logged = logs();
      expect(logged).toContain("Sign-in did not finish");
      for (const secret of [accessToken, code, email]) {
        expect(logged).not.toContain(secret);
      }
    },
  );
});
