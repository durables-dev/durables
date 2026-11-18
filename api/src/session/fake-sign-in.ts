import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app-env";
import { problemOnInvalid } from "../http/validation";
import { providers } from "../storage/storage";
import { beginSignIn } from "./begin-sign-in";

// The local fake sign-in provider (ADR 0004). It signs in as any identity the caller names,
// with no OAuth application, for local development and the e2e project. It is mounted in
// src/dev.ts only and must never be imported by src/index.ts.
//
// e2e relies on this route and its behaviour (api/CONVENTIONS.md, Owed to e2e). Change it
// only together with e2e.

const nameMessage = "Name the identity to sign in as.";

/** The identity to sign in as. Only the name is required. */
export const fakeIdentitySchema = z.object({
  // The session read returns the name, and must never return an email address.
  name: z
    .string({ error: nameMessage })
    .trim()
    .min(1, { error: nameMessage })
    .refine((name) => !name.includes("@"), {
      error: "The name can't be an email address.",
    }),
  email: z.email({ error: "Use an email address." }).optional(),
  /** Which provider the session says the publisher used. */
  provider: z.enum(providers).default("github"),
  username: z.string().trim().min(1).optional(),
  /**
   * The provider's account ID, which links to a Durables account. It defaults to one derived
   * from the provider and name, so the same name always signs in as the same account.
   */
  providerAccountId: z.string().trim().min(1).optional(),
});

export type FakeIdentity = z.input<typeof fakeIdentitySchema>;

/** The account ID a fake identity gets when the caller does not name one. */
export const fakeProviderAccountId = (name: string): string => `fake-${name}`;

/**
 * Mounted at /api/session/providers/fake in the local entry point. POST a JSON identity to
 * sign in as it. It issues the normal session through the auth interface and answers 204. When
 * the identity's account is pending deletion, it holds the sign-in for the Restore choice instead.
 * It logs nothing.
 */
export const fakeSignIn = new Hono<AppEnv>().post(
  "/",
  zValidator("json", fakeIdentitySchema, problemOnInvalid),
  async (c) => {
    const { name, email, provider, username, providerAccountId } =
      c.req.valid("json");
    // A pending account's sign-in is held for the Restore choice, as the provider callback
    // holds it (ADR 0015). Every other sign-in starts the session as before.
    await beginSignIn(c.var.auth, c.var.storage, {
      provider,
      providerAccountId: providerAccountId ?? fakeProviderAccountId(name),
      name,
      ...(email === undefined ? {} : { email }),
      ...(username === undefined ? {} : { username }),
    });
    c.header("Cache-Control", "no-store");
    return c.body(null, 204);
  },
);
