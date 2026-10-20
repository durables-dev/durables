import type { Context } from "hono";
import {
  deleteCookie,
  getCookie,
  getSignedCookie,
  setCookie,
  setSignedCookie,
} from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../app-env";
import { suggestHandle } from "../handles/handle-suggestion";
import { ProblemError } from "../http/problem";
import { type Provider, providers } from "../storage/storage";
import {
  fetchGitLabUser,
  gitLabAuthorizationUrl,
  GitLabProfileError,
} from "./gitlab";
import {
  type ClientCredentials,
  exchangeTimeoutMs,
  providerMiddleware,
  providerUserVariable,
  stateCookieName,
  TimeoutError,
  withTimeout,
} from "./oauth-providers";
import { identityFromProviderUser } from "./provider-identity";

// The auth interface (ADR 0007). Session handling and the provider exchange sit behind it, so
// the provider callbacks, the handle step and publishing reach them only through c.var.auth.

/** The cookie's name. Hono adds the __Host- prefix, so the browser sees __Host-session. */
export const sessionCookieName = "session";

/** How long a session lasts from sign-in. Changing the handle does not extend it. */
export const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

const cookieOptions = {
  prefix: "host",
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "Lax",
} as const;

/**
 * What the session cookie carries until the first publish creates the account: the provider
 * identity, the chosen handle and when the session ends. Provider tokens are never in it.
 */
const sessionSchema = z.object({
  provider: z.enum(providers),
  providerAccountId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().optional(),
  avatarUrl: z.string().optional(),
  /** The provider account's username, where the provider has one. Never shown as the name. */
  username: z.string().optional(),
  /**
   * The handle suggested from the provider account at sign-in, already cleaned to fit the
   * format rule. Absent when nothing in the account cleans to a valid handle.
   */
  suggestedHandle: z.string().optional(),
  handle: z.string().nullable(),
  /** Seconds since the epoch. */
  expiresAt: z.number().int(),
});

export type Session = z.infer<typeof sessionSchema>;

/** The provider identity a sign-in starts a session with. */
export type SessionIdentity = Omit<
  Session,
  "suggestedHandle" | "handle" | "expiresAt"
>;

/** The parts of a session a handler may change. */
export type SessionChanges = Pick<Session, "handle">;

/** Each provider's OAuth application credentials, as supplied at deploy. */
export type ProviderClients = Partial<Record<Provider, ClientCredentials>>;

/** Why a provider sign-in did not finish. Logged; never shown to the visitor. */
type SignInFailure =
  | "cancelled"
  | "provider-error"
  | "missing-code"
  | "state-mismatch"
  | "exchange-failed"
  | "timeout"
  | "profile-failed"
  | "incomplete-identity";

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const encoder = new TextEncoder();

/** How long a started sign-in may wait for its callback, as the sign-in package allows. */
const stateLifetimeSeconds = 600;

/** A fresh state for one sign-in: 32 random bytes, base64url, as the sign-in package makes. */
const randomState = (): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

/** Compares two secrets in constant time (api/CONVENTIONS.md). */
const secretsMatch = (a: string, b: string): boolean => {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return (
    left.byteLength === right.byteLength &&
    crypto.subtle.timingSafeEqual(left, right)
  );
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

/**
 * The current request's session. The auth middleware builds one per request and sets it on
 * c.var.auth. Reading or issuing a session without a signing key fails closed with 503.
 */
export class Auth {
  readonly #context: Context<AppEnv, string>;
  readonly #signingKey: string | undefined;
  readonly #clients: ProviderClients;
  readonly #exchangeTimeoutMs: number;

  constructor(
    context: Context<AppEnv, string>,
    signingKey: string | undefined,
    clients: ProviderClients = {},
    options: { exchangeTimeoutMs?: number } = {},
  ) {
    this.#context = context;
    this.#signingKey = signingKey;
    this.#clients = clients;
    this.#exchangeTimeoutMs = options.exchangeTimeoutMs ?? exchangeTimeoutMs;
  }

  /**
   * The signed-in session, or undefined when there is none. A cookie that is missing,
   * tampered with, signed with another key, malformed or expired counts as no session.
   */
  async session(): Promise<Session | undefined> {
    const value = await getSignedCookie(
      this.#context,
      this.#key(),
      sessionCookieName,
      cookieOptions.prefix,
    );
    if (!value) {
      return undefined;
    }
    const parsed = sessionSchema.safeParse(parseJson(value));
    if (!parsed.success || parsed.data.expiresAt <= nowInSeconds()) {
      return undefined;
    }
    return parsed.data;
  }

  /**
   * Signs the publisher in: issues a new session for the identity, with a handle suggested from
   * the provider account and no handle chosen.
   */
  async start(identity: SessionIdentity): Promise<Session> {
    const suggestedHandle = suggestHandle(identity);
    const session: Session = {
      ...identity,
      ...(suggestedHandle === undefined ? {} : { suggestedHandle }),
      handle: null,
      expiresAt: nowInSeconds() + sessionLifetimeSeconds,
    };
    await this.#issue(session);
    return session;
  }

  /** Changes the current session and reissues it with the same expiry. 401 with no session. */
  async update(changes: SessionChanges): Promise<Session> {
    const current = await this.session();
    if (current === undefined) {
      throw new ProblemError({ status: 401, detail: "Sign in first." });
    }
    const session: Session = { ...current, ...changes };
    await this.#issue(session);
    return session;
  }

  /** Signs the publisher out by clearing the cookie. Safe to call with no session. */
  end(): void {
    deleteCookie(this.#context, sessionCookieName, cookieOptions);
  }

  /**
   * Sends the visitor to the provider's consent screen, asking only for identity scopes, and
   * sets the state cookie the callback checks. The package does this for every provider but
   * GitLab, whose flow is hand-written. The callback URL must be the one
   * completeProviderSignIn is given.
   */
  async redirectToProvider(
    provider: Provider,
    callbackUrl: string,
  ): Promise<Response> {
    const c = this.#context;
    // With a code, the package would run the exchange. Starting never does.
    if (c.req.query("code") !== undefined) {
      throw new ProblemError({
        status: 400,
        detail: "Starting sign-in takes no code.",
      });
    }
    if (provider === "gitlab") {
      return this.#redirectToGitLab(callbackUrl);
    }
    const middleware = providerMiddleware(
      provider,
      this.#client(provider),
      callbackUrl,
    );
    const response = await middleware(c, () => Promise.resolve());
    if (!(response instanceof Response)) {
      throw new Error("The sign-in package did not redirect");
    }
    return response;
  }

  /**
   * Finishes a provider sign-in: checks the state, exchanges the code and reads the
   * provider identity. Undefined when the visitor cancelled, the provider answered with an
   * error, the state does not match, or the exchange failed or timed out. The provider's
   * tokens are used only here: they are dropped before this returns and never stored.
   * It does not start a session; the caller does that with the identity.
   */
  async completeProviderSignIn(
    provider: Provider,
    callbackUrl: string,
  ): Promise<SessionIdentity | undefined> {
    const c = this.#context;
    const client = this.#client(provider);
    try {
      const error = c.req.query("error");
      if (error !== undefined) {
        return this.#signInFailed(
          provider,
          error === "access_denied" ? "cancelled" : "provider-error",
        );
      }
      const code = c.req.query("code");
      if (code === undefined) {
        return this.#signInFailed(provider, "missing-code");
      }
      if (!this.#stateMatches()) {
        return this.#signInFailed(provider, "state-mismatch");
      }
      const user = await withTimeout(
        this.#providerUser(provider, client, code, callbackUrl),
        this.#exchangeTimeoutMs,
      );
      const identity = identityFromProviderUser(provider, user);
      return identity ?? this.#signInFailed(provider, "incomplete-identity");
    } catch (error) {
      return this.#signInFailed(
        provider,
        error instanceof TimeoutError
          ? "timeout"
          : error instanceof GitLabProfileError
            ? "profile-failed"
            : "exchange-failed",
        error,
      );
    } finally {
      this.#dropProviderResults();
      deleteCookie(c, stateCookieName, { path: "/", secure: true });
    }
  }

  /**
   * Starts a GitLab sign-in the way the package starts the others: a fresh state in a short
   * cookie, and a redirect to the consent screen carrying it.
   */
  #redirectToGitLab(callbackUrl: string): Response {
    const c = this.#context;
    const { clientId } = this.#client("gitlab");
    const state = randomState();
    setCookie(c, stateCookieName, state, {
      maxAge: stateLifetimeSeconds,
      httpOnly: true,
      path: "/",
      secure: true,
      sameSite: "Lax",
    });
    return c.redirect(
      gitLabAuthorizationUrl({ clientId, callbackUrl, state }),
      302,
    );
  }

  /**
   * Exchanges the code and returns the provider's user record. GitLab runs the hand-written
   * flow; the others run the package, which leaves the record on the context.
   */
  async #providerUser(
    provider: Provider,
    client: { clientId: string; clientSecret: string },
    code: string,
    callbackUrl: string,
  ): Promise<unknown> {
    if (provider === "gitlab") {
      return fetchGitLabUser(client, code, callbackUrl);
    }
    const c = this.#context;
    const middleware = providerMiddleware(provider, client, callbackUrl);
    await middleware(c, () => Promise.resolve());
    return c.get(providerUserVariable[provider]);
  }

  /** True when the state the provider returned is the one the start step stored. */
  #stateMatches(): boolean {
    const stored = getCookie(this.#context, stateCookieName);
    const returned = this.#context.req.query("state");
    return (
      stored !== undefined &&
      stored !== "" &&
      returned !== undefined &&
      returned !== "" &&
      secretsMatch(stored, returned)
    );
  }

  /** Clears what the package left on the context, so no token outlives the exchange. */
  #dropProviderResults(): void {
    const c = this.#context;
    c.set("token", undefined);
    c.set("refresh-token", undefined);
    c.set("granted-scopes", undefined);
    c.set("user-github", undefined);
    c.set("user-google", undefined);
    c.set("user-msentra", undefined);
  }

  /**
   * Records why a sign-in did not finish and returns no identity. Only the reason and the
   * error's name are logged: never its message, which may quote the provider's answer.
   */
  #signInFailed(
    provider: Provider,
    reason: SignInFailure,
    error?: unknown,
  ): undefined {
    if (reason !== "cancelled") {
      console.warn({
        message: "Sign-in did not finish",
        requestId: this.#context.var.requestId,
        provider,
        reason,
        ...(error instanceof Error ? { error: { name: error.name } } : {}),
      });
    }
    return undefined;
  }

  /**
   * Whether this provider's credentials are configured. When they are not, it logs the
   * misconfiguration, and the sign-in routes send the visitor to the failure redirect.
   */
  providerAvailable(provider: Provider): boolean {
    const client = this.#clients[provider];
    if (!client?.clientId || !client.clientSecret) {
      console.error({
        message: "A sign-in provider's credentials are not configured",
        requestId: this.#context.var.requestId,
        provider,
      });
      return false;
    }
    return true;
  }

  #client(provider: Provider): { clientId: string; clientSecret: string } {
    const client = this.#clients[provider];
    // The routes check providerAvailable first. This guard keeps the method fail-closed.
    if (!client?.clientId || !client.clientSecret) {
      throw new ProblemError({
        status: 503,
        title: "Service Unavailable",
        detail: "Signing in with this provider is not available right now.",
      });
    }
    return { clientId: client.clientId, clientSecret: client.clientSecret };
  }

  async #issue(session: Session): Promise<void> {
    await setSignedCookie(
      this.#context,
      sessionCookieName,
      JSON.stringify(session),
      this.#key(),
      {
        ...cookieOptions,
        maxAge: Math.max(0, session.expiresAt - nowInSeconds()),
      },
    );
  }

  #key(): string {
    if (!this.#signingKey) {
      console.error({
        message: "The session signing key is not configured",
        requestId: this.#context.var.requestId,
      });
      throw new ProblemError({
        status: 503,
        title: "Service Unavailable",
        detail: "Signing in is not available right now.",
      });
    }
    return this.#signingKey;
  }
}
