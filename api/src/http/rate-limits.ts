import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";

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
