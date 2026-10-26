import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import type { Session } from "../auth/auth";

/**
 * Sets the rate-limit bindings on c.var for every handler (ADR 0006): the detection
 * preview's on c.var.previewLimit and publishing's on c.var.publishLimit. Their limits and
 * periods are set in wrangler.toml.
 */
export const rateLimits = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("previewLimit", c.env.PREVIEW_LIMIT);
    c.set("publishLimit", c.env.PUBLISH_LIMIT);
    await next();
  });

/**
 * The rate-limit key for publishing and the detection preview: the signed-in publisher's
 * provider identity, so each publisher has their own limit whatever their IP or however many
 * sessions they hold.
 */
export const publisherLimitKey = ({
  provider,
  providerAccountId,
}: Pick<Session, "provider" | "providerAccountId">): string =>
  `${provider}:${providerAccountId}`;
