import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import { Storage } from "./storage";

/**
 * Builds the storage from the Worker's bindings. The middleware below uses it for every request,
 * and the scheduled handler uses it for the daily final-deletion job, which has no request.
 */
export const createStorage = (
  bindings: Pick<CloudflareBindings, "DB" | "DOCUMENTS">,
): Storage => new Storage(bindings.DB, bindings.DOCUMENTS);

/** Builds the storage from the bindings and sets it on c.var.storage for every handler. */
export const storage = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("storage", createStorage(c.env));
    await next();
  });
