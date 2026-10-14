import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import { Auth } from "../auth/auth";
import { identityScopes } from "../auth/oauth-providers";
import { onError } from "../http/error-handlers";
import app from "../index";
import { readAllRows, seedAccount } from "../storage/seed";
import {
  signedInPath,
  signIn as signInRoutes,
  signInFailedPath,
} from "./sign-in";

// The OAuth providers are the outside world, so only their endpoints are faked: a stand-in
// for the global fetch answers the token, user and email requests the sign-in package makes.
// D1 and every internal module are real, and requests go to the Worker over HTTP.

const providers = ["github", "google", "microsoft"] as const;
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
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  microsoft: "https://login.microsoft.com/common/oauth2/v2.0/authorize",
};

const tokenUrls: Record<Provider, string> = {
  github: "https://github.com/login/oauth/access_token",
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoft.com/common/oauth2/v2.0/token",
};

const userUrls: Record<Provider, string> = {
  github: "https://api.github.com/user",
  google: "https://www.googleapis.com/oauth2/v2/userinfo",
  microsoft: "https://graph.microsoft.com/v1.0/me",
};

const githubEmailsUrl = "https://api.github.com/user/emails";

const grantedScopes: Record<Provider, string> = {
  github: "user:email",
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
  emails?: unknown;
}

/** Every request the Worker made to a provider, by URL. */
let providerRequests: string[] = [];

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
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const request = new Request(input, init);
    const url = request.url.split("?")[0] ?? "";
    providerRequests.push(url);
    if (request.method === "POST" && url === tokenUrls[provider]) {
      return token();
    }
    if (request.method === "GET" && url === userUrls[provider]) {
      return Promise.resolve(Response.json(user));
    }
    if (request.method === "GET" && url === githubEmailsUrl) {
      return Promise.resolve(
        Response.json(
          answers.emails ?? [{ email, primary: true, verified: true }],
        ),
      );
    }
    return Promise.reject(new Error(`Unexpected request to ${url}`));
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

/** Starts sign-in and returns the state the provider is sent and the cookie that holds it. */
const start = async (provider: Provider) => {
  const response = await get(`/api/session/providers/${provider}`);
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("Location") ?? "");
  const stateCookie = cookieNamed(response, "state") ?? "";
  return {
    response,
    location,
    state: location.searchParams.get("state") ?? "",
    stateCookie,
  };
};

const callback = (provider: string, query: string, cookie?: string) =>
  get(`/api/session/providers/${provider}/callback?${query}`, cookie);

/** Runs a whole sign-in and returns the callback's response. */
const signIn = async (provider: Provider) => {
  const { state, stateCookie } = await start(provider);
  return callback(
    provider,
    `code=${code}&state=${encodeURIComponent(state)}`,
    stateCookie,
  );
};

const readSession = async (response: Response) => {
  const cookie = cookieNamed(response, "__Host-session");
  expect(cookie).toBeDefined();
  const session = await get("/api/session", cookie);
  return session.json<{ user: Record<string, unknown> | null }>();
};

const expectFailureRedirect = (response: Response) => {
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(signInFailedPath);
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

  test("fails closed with 503 when the provider's credentials are missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await app.request(
      "/api/session/providers/google",
      {},
      { ...env, GOOGLE_CLIENT_SECRET: undefined },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
  });
});

describe("GET /api/session/providers/:provider/callback", () => {
  test.each(providers)(
    "establishes a session for %s and redirects to the Contribute flow",
    async (provider) => {
      fakeProvider(provider);

      const response = await signIn(provider);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(signedInPath);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await readSession(response)).toEqual({
        user: {
          name: "Ada Lovelace",
          initials: "AL",
          provider,
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
    "shows account-exists for a %s account already linked to a Durables account",
    async (provider) => {
      const { accountId } = fakeProvider(provider);
      await seedAccount(env.DB, { provider, providerAccountId: accountId });

      const response = await signIn(provider);

      expect(response.headers.get("Location")).toBe(signedInPath);
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

  test("redirects with the failure indicator when the exchange times out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { state, stateCookie } = await start("microsoft");
    // The provider answers, with a refusal, only well after a short exchange timeout.
    fakeProvider("microsoft", {
      token: () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(Response.json({ error: "too_late" }, { status: 400 }));
          }, 500);
        }),
    });

    const response = await shortTimeoutApp.request(
      `/api/session/providers/microsoft/callback?code=${code}&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: stateCookie } },
      env,
    );

    expectFailureRedirect(response);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "microsoft", reason: "timeout" }),
    );
  });

  test("completes without an email when the provider returns none", async () => {
    fakeProvider("github", {
      user: { id: 77, login: "ada", name: "Ada Lovelace", email: null },
      emails: [],
    });

    const response = await signIn("github");

    expect(response.headers.get("Location")).toBe(signedInPath);
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

  test("never asks for or creates a password", async () => {
    fakeProvider("github");
    const { location } = await start("github");

    const response = await signIn("github");

    expect(location.search).not.toMatch(/password/iu);
    expect(response.headers.get("Location")).not.toMatch(/password/iu);
    expect(JSON.stringify(await readSession(response))).not.toMatch(
      /password/iu,
    );
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
