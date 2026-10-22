import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";

/**
 * Sets the detection preview's rate-limit binding on c.var.previewLimit for every handler
 * (ADR 0006). Its limit and period are set in wrangler.toml.
 */
export const rateLimits = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("previewLimit", c.env.PREVIEW_LIMIT);
    await next();
  });
