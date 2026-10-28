import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app-env";
import { ProblemError } from "../http/problem";
import type { Session } from "./auth";

/** The signed-in publisher, set on c.var by requirePublisher. */
export interface PublisherVariables {
  Variables: { publisher: Session };
}

/** Answers 401 when there is no signed-in session, and sets the publisher on c.var. */
export const requirePublisher = () =>
  createMiddleware<AppEnv & PublisherVariables>(async (c, next) => {
    const publisher = await c.var.auth.session();
    if (publisher === undefined) {
      throw new ProblemError({ status: 401, detail: "Sign in first." });
    }
    c.set("publisher", publisher);
    await next();
  });
