import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import { Storage } from "./storage";

/** Builds the storage from the bindings and sets it on c.var.storage for every handler. */
export const storage = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("storage", new Storage(c.env.DB));
    await next();
  });
