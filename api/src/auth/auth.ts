import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../app-env";
import { ProblemError } from "../http/problem";
import { providers } from "../storage/storage";

// The auth interface (ADR 0007). Session handling sits behind it, so the provider callbacks,
// the handle step and publishing read and change the session only through c.var.auth.

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
  handle: z.string().nullable(),
  /** Seconds since the epoch. */
  expiresAt: z.number().int(),
});

export type Session = z.infer<typeof sessionSchema>;

/** The provider identity a sign-in starts a session with. */
export type SessionIdentity = Omit<Session, "handle" | "expiresAt">;

/** The parts of a session a handler may change. */
export type SessionChanges = Pick<Session, "handle">;

const nowInSeconds = () => Math.floor(Date.now() / 1000);

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
  readonly #context: Context<AppEnv>;
  readonly #signingKey: string | undefined;

  constructor(context: Context<AppEnv>, signingKey: string | undefined) {
    this.#context = context;
    this.#signingKey = signingKey;
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

  /** Signs the publisher in: issues a new session for the identity, with no handle chosen. */
  async start(identity: SessionIdentity): Promise<Session> {
    const session: Session = {
      ...identity,
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
